const express = require("express");
const router = express.Router();
const multer = require("multer");
const { pool } = require("../config/db");
const mailparser = require("mailparser");
const fs = require("fs").promises;
const path = require("path");
const authMiddleware = require("../middlewares/authMiddleware");
const moment = require("moment");

const storage = multer.diskStorage({
  destination: "./uploads/trips/",
  filename: (req, file, cb) => {
    cb(null, `trip_${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage: storage });

const parseFlightEmail = async (filePath) => {
  const email = await mailparser.simpleParser(await fs.readFile(filePath));
  const text = email.text || "";

  //  Extract GOING OUT and COMING BACK sections
  const goingOutSection = text.match(
    /GOING OUT[\s\S]*?(?=COMING BACK|Payment summary)/i
  )?.[0];
  const comingBackSection = text.match(
    /COMING BACK[\s\S]*?(?=Payment summary|Reservation information)/i
  )?.[0];

  //  Extract outbound/return times
  const extractFlightDetails = (section) => {
    const flightNumber = section?.match(/Flight Number:\s*W4\s*(\d+)/i)?.[1];
    const depMatch = section?.match(/Departs from:\s*([^\n\r]+)/i)?.[1]?.trim();
    const arrMatch = section?.match(/Arrives to:\s*([^\n\r]+)/i)?.[1]?.trim();
    const timeMatches =
      section?.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/g) || [];
    return {
      flightNumber: flightNumber ? `W4 ${flightNumber}` : null,
      departure: depMatch || null,
      arrival: arrMatch || null,
      departureTime: timeMatches[0] || null,
      arrivalTime: timeMatches[1] || null,
    };
  };

  const outbound = extractFlightDetails(goingOutSection);
  const returning = extractFlightDetails(comingBackSection);

  //  Extract passengers
  const passengerMatches = text.match(/MR\s+[A-Za-z]+\s+[A-Za-z]+/g) || [];
  const passengers = [
    ...new Set(
      passengerMatches.map((p) =>
        p
          .replace(/^MR\s+/, "")
          .replace(/\s+/g, " ")
          .trim()
      )
    ),
  ];

  //  Extract flight total payment
  const paymentMatch = text.match(/Grand total\s+([\d.,]+)\s+EUR/i);
  const flightPayment = paymentMatch
    ? parseFloat(paymentMatch[1].replace(",", "."))
    : null;

  return {
    outbound,
    return: returning,
    flightPayment,
    passengers,
  };
};

const parseHotelEmail = async (filePath) => {
  const email = await mailparser.simpleParser(await fs.readFile(filePath));
  const text = email.text || email.html || "";
  //   console.log("Raw hotel text:", text);

  const name =
    text
      .match(
        /Property name\s*[\n\s]*([A-Za-z&\s]+)(?=\n\s*Property address|\n\s*Check-in|$)/i
      )?.[1]
      .trim() || null;
  const checkInDate =
    text.match(
      /Check-in\s*[\n\s]*([A-Za-z]+,\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})/i
    )?.[1] || null;
  const checkOutDate =
    text.match(
      /Check-out\s*[\n\s]*([A-Za-z]+,\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})/i
    )?.[1] || null;
  const address =
    text
      .match(/Property address\s*[\n\s]*(.+?)(?=\n\n|\nCheck-in|$)/is)?.[1]
      .trim() || null;
  const amount =
    text.match(
      /Amount paid on\s*\d{2}\s+[A-Za-z]+\s+\d{4}\s*€\s*(\d+)/i
    )?.[1] || null;

  const hotelPayment = amount ? parseFloat(amount) : null;
  const confirmationNumber =
    text.match(/Booking number\s*[\n\s]*(\d+)/i)?.[1] || null;

  const nights =
    checkInDate && checkOutDate
      ? Math.ceil(
          (new Date(checkOutDate) - new Date(checkInDate)) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  return {
    name: name,
    roomType: text.match(/room type:\s*([A-Za-z&\s]+)/i)?.[1].trim() || null,
    nights: nights,
    checkIn: checkInDate,
    checkOut: checkOutDate,
    roomNumber: text.match(/room\s*#(\d+)/i)?.[1] || null,
    address: address,
    amount: amount ? `${amount}` : null,
    confirmationNumber: confirmationNumber,
    hotelPayment,
  };
};

router.post(
  "/add-trip",
  authMiddleware,
  upload.fields([
    { name: "boardingTicket", maxCount: 1 },
    { name: "hotelBooking", maxCount: 1 },
  ]),
  async (req, res) => {
    const { id: userId } = req.user;
    const { destination, members: manualMembersRaw } = req.body;

    let manualMembers = [];
    try {
      if (manualMembersRaw) {
        manualMembers = JSON.parse(manualMembersRaw);
        if (!Array.isArray(manualMembers))
          throw new Error("Invalid members format");
      }
    } catch (err) {
      return res.status(400).json({ message: "Invalid members array" });
    }

    try {
      let flightDetails = null;
      let hotelDetails = null;
      let startDate = null;
      let endDate = null;
      let flightPassengers = [];
      let flightPayment = null;

      // Parse boarding pass
      if (req.files["boardingTicket"]) {
        const filePath = req.files["boardingTicket"][0].path;
        flightDetails = await parseFlightEmail(filePath);
        flightPassengers = flightDetails.passengers || [];
        flightPayment = flightDetails.flightPayment || 0;

        // Set dates from flight
        startDate = flightDetails.outbound.departureTime
          ? moment(flightDetails.outbound.departureTime, "DD/MM/YYYY HH:mm")
              .local()
              .format("YYYY-MM-DD")
          : null;

        console.log("Start date after", startDate);

        endDate = flightDetails.return.departureTime
          ? moment(flightDetails.return.departureTime, "DD/MM/YYYY HH:mm")
              .local()
              .format("YYYY-MM-DD")
          : null;

        await fs.unlink(filePath);
      }

      // Parse hotel booking
      if (req.files["hotelBooking"]) {
        const filePath = req.files["hotelBooking"][0].path;
        hotelDetails = await parseHotelEmail(filePath);

        // Fallback for dates if flight doesn't provide them
        if (!startDate && hotelDetails.checkIn)
          startDate = moment(hotelDetails.checkIn, "dddd, D MMMM YYYY")
            .local()
            .format("YYYY-MM-DD");

        if (!endDate && hotelDetails.checkOut)
          endDate = moment(hotelDetails.checkOut, "dddd, D MMMM YYYY")
            .local()
            .format("YYYY-MM-DD");

        await fs.unlink(filePath);
      }

      // Combine all members (from form + parsed passengers)
      const combinedMembers = [
        ...new Set([...manualMembers, ...flightPassengers]),
      ];

      const timeline = [
        {
          time: flightDetails?.outbound?.departureTime
            ? moment(
                flightDetails.outbound.departureTime,
                "DD/MM/YYYY HH:mm"
              ).format("dddd, D MMMM YYYY")
            : null,
          event: "Flight Outbound",
          details: `${flightDetails?.outbound?.departure} - ${flightDetails?.outbound?.arrival}`,
        },
        {
          time: flightDetails?.return?.departureTime
            ? moment(
                flightDetails.return.departureTime,
                "DD/MM/YYYY HH:mm"
              ).format("dddd, D MMMM YYYY")
            : null,
          event: "Flight Return",
          details: `${flightDetails?.return?.departure} - ${flightDetails?.return?.arrival}`,
        },
        {
          time: hotelDetails?.checkIn || null,
          event: "Check-in",
          details: hotelDetails?.name,
        },
        {
          time: hotelDetails?.checkOut || null,
          event: "Check-out",
          details: hotelDetails?.name,
        },
      ].filter((item) => item.time);

      const expenses = {
        transport: flightPayment,
        hotel: hotelDetails?.hotelPayment || 0,
        other: 52,
      };

      const [result] = await pool.query(
        "INSERT INTO trips (userId, startDate, endDate, destination, flightDetails, hotelDetails, members, timeline, expenses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          startDate,
          endDate,
          destination,
          JSON.stringify(flightDetails),
          JSON.stringify(hotelDetails),
          JSON.stringify(combinedMembers),
          JSON.stringify(timeline),
          JSON.stringify(expenses),
        ]
      );

      res.status(201).json({ message: "Trip added", tripId: result.insertId });
    } catch (error) {
      console.error("Trip creation error:", error.message);
      res.status(500).json({ message: "Failed to add trip" });
    }
  }
);

router.get("/getTrips", authMiddleware, async (req, res) => {
  const { id: userId } = req.user;
  try {
    const [trips] = await pool.query(
      "SELECT * FROM trips WHERE userId = ? ORDER BY startDate DESC",
      [userId]
    );

    // Optionally parse JSON fields
    const parsedTrips = trips.map((trip) => ({
      ...trip,
      flightDetails: JSON.parse(trip.flightDetails || "{}"),
      hotelDetails: JSON.parse(trip.hotelDetails || "{}"),
      members: JSON.parse(trip.members || "[]"),
      timeline: JSON.parse(trip.timeline || "[]"),
      expenses: JSON.parse(trip.expenses || "{}"),
    }));

    res.status(200).json({ trips: parsedTrips });
  } catch (error) {
    console.error("Error fetching trips:", error.message);
    res.status(500).json({ message: "Failed to load trips" });
  }
});

module.exports = router;
