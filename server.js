import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import otpRoutes from "./routes/otpRoutes.js";
import adminRoutes from "./routes/AdminRoutes.js";
import AuthRoutes from "./routes/AuthRoutes.js";
// import SubmissionRoutes from "./routes/round1SubmissionRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import actionCardRoutes from "./routes/actionCardRoutes.js";
import algorithmRoutes from "./routes/algorithmRoutes.js";
import round1Routes from "./routes/round1Routes.js";
import round2Routes from "./routes/round2Routes.js";
import round1SubmissionRoutes from "./routes/round1submissionRoutes.js";
import round2SubmissionRoutes from "./routes/round2submissionRoutes.js";
import leaderboardRoutes from "./routes/leaderboardRoutes.js";
import GameLogicRoutes from "./routes/GameLogicRoutes.js";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174", "http://10.1.10.193:6767"],
    credentials: true,
  })
);
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.log("MongoDB connection error ❌", err));

// Routes
const mainRouter = express.Router();

// Health check
mainRouter.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

// Admin routes (existing — includes nested round1/2 questions, leaderboard, teams, algorithm cards)
mainRouter.use("/api/admin", adminRoutes);
mainRouter.use("/api/otp", otpRoutes);
mainRouter.use("/api/round1", round1Routes);
mainRouter.use("/api/auth", AuthRoutes);
mainRouter.use("/api/teams", teamRoutes);
// mainRouter.use("/", SubmissionRoutes);

// Team routes
mainRouter.use("/api/teams", teamRoutes);

// OTP routes
mainRouter.use("/api/otp", otpRoutes);

// Standalone Round 1 & Round 2 question routes
mainRouter.use("/api/round1", round1Routes);
mainRouter.use("/api/round2", round2Routes);

//round2 questions generarte routes
mainRouter.use("/kriyabe/api/round2", round2Routes);

// Submission routes
mainRouter.use("/api/round1/submissions", round1SubmissionRoutes);
mainRouter.use("/api/round2/submissions", round2SubmissionRoutes);

// Algorithm card routes (standalone)
mainRouter.use("/api/algorithms", algorithmRoutes);

// Action card routes
mainRouter.use("/api/actionCards", actionCardRoutes);

// Leaderboard routes (standalone)
mainRouter.use("/api/leaderboard", leaderboardRoutes);

// New Action Card System Routes
mainRouter.use("/api", GameLogicRoutes);       // Mounts /players/:playerId/submit and minigame-complete

app.use("/kriyabe", mainRouter);

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
