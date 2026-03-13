import Team from "../models/Team.js";
import Round1Question from "../models/round1questions.js";
import Round1Submission from "../models/round1submission.js";
import Round2Question from "../models/round2questions.js";
import Round2Submission from "../models/round2submission.js";
import { getShipConfig } from "../config/shipConfig.js";
import { syncLeaderboard } from "../services/scoringService.js";

export const getTeams = async (_req, res) => {
  try {
    const teams = await Team.find();
    res.json(teams);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching teams", error: err });
  }
};

export const getTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ msg: "Team not found" });
    res.json(team);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching team", error: err });
  }
};

export const createTeam = async (req, res) => {
  try {
    const { teamName, kriyaID, captainName, regMail, shipConfig } = req.body;

    if (!teamName || !kriyaID || !captainName || !regMail || !shipConfig) {
      return res.status(400).json({ msg: "All required fields must be provided" });
    }

    const team = new Team(req.body);
    await team.save();
    res.status(201).json(team);
  } catch (err) {
    res.status(400).json({ msg: "Error creating team", error: err.message });
  }
};

export const updateTeam = async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!team) return res.status(404).json({ msg: "Team not found" });
    res.json(team);
  } catch (err) {
    res.status(400).json({ msg: "Error updating team", error: err });
  }
};

export const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);
    if (!team) return res.status(404).json({ msg: "Team not found" });
    res.json({ msg: "Team deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Error deleting team", error: err });
  }
};

/**
 * Choose ship configuration for the team.
 * Sets the shipConfig string (WARSHIP, MERCHANT, GHOST).
 */
export const selectShip = async (req, res) => {
  try {
    const { kriyaID, shipConfig } = req.body;

    if (!kriyaID || !shipConfig) {
      return res.status(400).json({
        success: false,
        message: "kriyaID and shipConfig required"
      });
    }

    const team = await Team.findOne({ kriyaID });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found"
      });
    }

    team.shipConfig = shipConfig;
    await team.save();

    res.status(200).json({
      success: true,
      message: "Ship selected successfully",
      shipConfig: team.shipConfig
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Submit Round 1 answers.
 * Creates Round1Submission records and updates team score.
 */
export const round1Answers = async (req, res) => {
  try {
    const { questionId, submittedAnswer, timeTaken } = req.body;

    if (!questionId || submittedAnswer === undefined) {
      return res.status(400).json({ msg: "questionId and submittedAnswer are required" });
    }

    const team = await Team.findById(req.team._id);
    if (!team) return res.status(404).json({ msg: "Team not found" });

    const question = await Round1Question.findById(questionId);
    if (!question) return res.status(404).json({ msg: "Question not found" });

    // Check if correct (case-insensitive)
    const isCorrect = question.correctAnswer.trim().toLowerCase() === submittedAnswer.trim().toLowerCase();

    // Create submission record
    const submission = new Round1Submission({
      teamId: team._id,
      questionId,
      submittedAnswer,
      isCorrect,
      timeTaken: timeTaken || 0
    });
    await submission.save();

    // Update score if correct
    if (isCorrect) {
      const points = 10; // base points per question
      team.round1.score = (team.round1.score || 0) + points;
      team.totalScore = (team.totalScore || 0) + points;
      await team.save();
      await syncLeaderboard(team._id);
    }

    res.json({
      msg: isCorrect ? "Correct answer!" : "Wrong answer",
      isCorrect,
      submission: submission._id,
      round1Score: team.round1.score,
      totalScore: team.totalScore
    });
  } catch (err) {
    res.status(500).json({ msg: "Error submitting round 1 answer", error: err.message });
  }
};

/**
 * Round 2 session initialization.
 * Maps team's selectedScrolls (algorithm card IDs) to Round 2 problems.
 * Sets problemsStatus with initial lives based on ship type.
 */
export const round2Answers = async (req, res) => {
  try {
    const team = await Team.findById(req.team._id);
    if (!team) return res.status(404).json({ msg: "Team not found" });

    const selectedScrolls = team.round1.selectedScrolls;
    if (!selectedScrolls || selectedScrolls.length === 0) {
      return res.status(400).json({ msg: "No scrolls selected in Round 1" });
    }

    // Map each scroll to a Round 2 problem
    const problemsStatus = [];
    const AlgorithmCard = (await import("../models/AlgorithmCard.js")).default;
    
    const shipConfig = getShipConfig(team.shipConfig);
    const initialLives = shipConfig ? shipConfig.round2Lives : 3;

    for (const scroll of selectedScrolls) {
      // Find the algorithm card by name to get its ID
      const algo = await AlgorithmCard.findOne({ name: scroll.name });
      if (!algo) {
        console.error(`Algorithm card not found for name: ${scroll.name}`);
        continue;
      }

      const problem = await Round2Question.findOne({
        allowedAlgorithms: algo._id
      });

      if (problem) {
        problemsStatus.push({
          problemId: problem._id,
          livesLeft: initialLives,
          bonusLives: 0, // Track extra lives from action cards separately
          wrongSubmissions: 0,
          status: "NOT_STARTED"
        });
      } else {
        console.warn(`No Round 2 problem found for algorithm: ${scroll.name} (${algo._id})`);
      }
    }

    if (problemsStatus.length === 0) {
        return res.status(400).json({ 
            msg: "Could not find any problems for your selected scrolls. Please contact an admin." 
        });
    }

    team.round2.problemsStatus = problemsStatus;
    await team.save();

    res.json({
      msg: "Round 2 initialized",
      problemsStatus: team.round2.problemsStatus
    });
  } catch (err) {
    res.status(500).json({ msg: "Error initializing Round 2", error: err.message });
  }
};

/**
 * Get team profile by ID.
 */
export const getProfile = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .select("-otp -otpExpiry");
    if (!team) return res.status(404).json({ msg: "Team not found" });
    res.json(team);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching profile", error: err.message });
  }
};

/**
 * Get team progress by ID (rounds, scores, problem statuses).
 */
export const getProgress = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .select("teamName shipConfig round1 round2 totalScore currentIsland");
    if (!team) return res.status(404).json({ msg: "Team not found" });

    const shipConfig = getShipConfig(team.shipConfig);
    res.json({
      teamName: team.teamName,
      shipConfig: team.shipConfig,
      shipDetails: shipConfig,
      round1: team.round1,
      round2: team.round2,
      totalScore: team.totalScore,
      currentIsland: team.currentIsland
    });
  } catch (err) {
    res.status(500).json({ msg: "Error fetching progress", error: err.message });
  }
};

/**
 * Delete a Round 1 answer by submission ID.
 */
export const deleteRound1Answer = async (req, res) => {
  try {
    const submission = await Round1Submission.findByIdAndDelete(req.params.id);
    if (!submission) return res.status(404).json({ msg: "Submission not found" });
    res.json({ msg: "Round 1 answer deleted" });
  } catch (err) {
    res.status(500).json({ msg: "Error deleting answer", error: err.message });
  }
};

/**
 * Delete a Round 2 answer by submission ID.
 */
export const deleteRound2Answer = async (req, res) => {
  try {
    const submission = await Round2Submission.findByIdAndDelete(req.params.id);
    if (!submission) return res.status(404).json({ msg: "Submission not found" });
    res.json({ msg: "Round 2 answer deleted" });
  } catch (err) {
    res.status(500).json({ msg: "Error deleting answer", error: err.message });
  }
};

/**
 * Update an answer (Round 1 or Round 2) by submission ID.
 */
export const updateAnswer = async (req, res) => {
  try {
    // Try Round 1 first
    let submission = await Round1Submission.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (submission) return res.json(submission);

    // Try Round 2
    submission = await Round2Submission.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (submission) return res.json(submission);

    return res.status(404).json({ msg: "Answer not found" });
  } catch (err) {
    res.status(500).json({ msg: "Error updating answer", error: err.message });
  }
};

