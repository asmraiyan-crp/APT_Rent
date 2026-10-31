require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const propertyRoutes = require('./routes/propertyRoutes');
const applicationRoutes = require("./routes/applicationRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const contractRoutes = require("./routes/contractRoutes");
const rentRoutes = require("./routes/rentRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const historyRoutes = require("./routes/historyRoutes");
const landlordRoutes = require("./routes/landlordRoutes");
const messageRoutes = require("./routes/messageRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { initSocket } = require("./utils/socket.js");
const appointmentRescheduleRoutes = require("./routes/appointmentRescheduleRoutes");
const { startAppointmentSweeper } = require("./services/appointmentLifecycle.js");
const savedRoutes = require("./routes/savedRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const unitsRoutes = require("./routes/unitsRoutes");
const { envelopeLegacyResponses, notFoundHandler, errorHandler } = require("./middleware/errorEnvelope.js");

const app = express();
const httpServer = http.createServer(app); // Express app wrapped so Socket.IO can share the same port
initSocket(httpServer);

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? ["http://localhost:5173", "http://localhost:4173"],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(envelopeLegacyResponses);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/appointments", appointmentRescheduleRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/rent", rentRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/landlord", landlordRoutes);
app.use("/api/conversations", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/saved", savedRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/units", unitsRoutes);
//app,use(cors());

app.get("/", (req, res) => {
  res.status(200).json({ message: "API is running sucessfully," });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.use((req, res, next) => {
  res.status(404).json({ statusCode: 404, message: "Endpoint not found" });
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ sucess: false, message: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
  startAppointmentSweeper();

});