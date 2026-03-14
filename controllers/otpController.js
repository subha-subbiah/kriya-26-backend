import Team from "../models/Team.js";
import generateOTP from "../utils/otpGenerator.js";
import sendOTPEmail from "../services/mailService.js";
import jwt from "jsonwebtoken";

export const sendOTP = async (req, res) => {
  const { kriyaID } = req.body;
  if (!kriyaID) {
    return res.status(400).json({ message: "kriyaID is required" });
  }

  try {
    const team = await Team.findOne({ kriyaID });
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    team.otp = otp;
    team.otpExpiry = expiresAt;
    await team.save();

    await sendOTPEmail(team.regMail, otp); // already normalized by schema

    return res.status(200).json({ message: "OTP sent to registered email" });
  } catch (error) {
    console.error("Error in sendOTP:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



export const verifyOTP = async (req, res) => {
  const { kriyaID, otp } = req.body;
  if (!kriyaID || !otp) {
    return res.status(400).json({ message: "kriyaID and otp are required" });
  }

  try {
    const team = await Team.findOne({ kriyaID });
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    if (!team.otp) {
      return res.status(400).json({ message: "No OTP generated for this team" });
    }

    // Check expiry
    if (team.otpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Check OTP match
    if (team.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP is valid, clear it from DB
    team.otp = null;
    team.otpExpiry = null;
    await team.save();

    const token = jwt.sign(
      { id: team._id, kriyaID: team.kriyaID, role: "team" },
      process.env.JWT_SECRET,
      { expiresIn: "6h" }
    );

    res.status(200).json({
      message: "OTP verified successfully",
      token,
      team: {
        id: team._id,
        teamName: team.teamName,
        kriyaID: team.kriyaID,
        shipConfig: team.shipConfig,
        currentIsland: team.currentIsland,
        setNo: team.setNo
      }
    });
  } catch (error) {
    console.error("Error in verifyOTP:", error);
    res.status(500).json({ message: "OTP verification failed" });
  }
};
