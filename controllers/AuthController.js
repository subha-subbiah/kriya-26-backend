import jwt from "jsonwebtoken";
import Team from "../models/Team.js";
import jwt from "jsonwebtoken";

// CREATE TEAM / SIGNUP
export const signupTeam = async (req, res) => {
  try {
    const { teamName, kriyaID, captainName, regMail } = req.body;

    console.log("Signup body:", req.body);

    if (!teamName || !kriyaID || !captainName || !regMail) {
      return res.status(400).json({
        msg: "teamName, kriyaID, captainName and regMail are required",
      });
    }

    const existingTeamName = await Team.findOne({ teamName: teamName.trim() });
    if (existingTeamName) {
      return res.status(400).json({
        msg: "Team name already exists",
      });
    }

    const existingKriyaID = await Team.findOne({ kriyaID: kriyaID.trim() });
    if (existingKriyaID) {
      return res.status(400).json({
        msg: "Kriya ID already exists",
      });
    }

    const existingMail = await Team.findOne({ regMail: regMail.trim() });
    if (existingMail) {
      return res.status(400).json({
        msg: "Email already registered",
      });
    }

    const newTeam = new Team({
      teamName: teamName.trim(),
      kriyaID: kriyaID.trim(),
      captainName: captainName.trim(),
      regMail: regMail.trim(),
    });

    await newTeam.save();

    return res.status(201).json({
      msg: "Team registered successfully",
      team: newTeam,
    });
  } catch (error) {
    console.error("SIGNUP ERROR:", error);

    return res.status(500).json({
      msg: "Error during team signup",
      error: error.message,
    });
  }
};

//Login Team
export const loginTeam = async (req, res) => {
  try {

    const { kriyaId, email } = req.body;

    if (!kriyaId || !email) {
      return res.status(400).json({
        success: false,
        message: "Kriya ID and Email are required"
      });
    }

    // Find Team
    const team = await Team.findOne({ kriyaID: kriyaId });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Invalid Kriya ID"
      });
    }

    // Email Check
    if (team.regMail !== email) {
      return res.status(401).json({
        success: false,
        message: "Email does not match registered email"
      });
    }

    // Assign random set if not already assigned
    if (!team.setNo || team.setNo === "") {

      const randomSet = Math.floor(Math.random() * 6) + 1;

      team.setNo = randomSet;

      await team.save();

      console.log(`Set ${randomSet} assigned to ${team.kriyaID}`);

    }

    const token = jwt.sign(
      { id: team._id, kriyaID: team.kriyaID, role: "team" },
      process.env.JWT_SECRET,
      { expiresIn: "6h" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
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

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};