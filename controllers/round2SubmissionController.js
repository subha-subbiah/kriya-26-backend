import Round2Submission from "../models/round2submission.js";
import Team from "../models/Team.js";
import Round2Question from "../models/round2questions.js";
import { runTestCases } from "../services/codeExecutionService.js";
import { calculateScore, syncLeaderboard } from "../services/scoringService.js";
import { getShipConfig } from "../config/shipConfig.js";

/**
 * Round 2 submission pipeline.
 *
 * Flow:
 * 1. Validate problem status (reject SOLVED, allow SUNK with reset lives)
 * 2. Execute code via Judge0
 * 3. Compilation failure → lifeLost, decrement livesLeft
 * 4. Wrong answer → lifeLost, decrement livesLeft
 * 5. All tests pass → SOLVED, calculate score with ship multiplier, sync leaderboard
 * 6. livesLeft === 0 → SUNK, reset lives to ship's initial count
 */
export const createSubmission = async (req, res) => {
    try {
        const { teamId, kriyaID, problemId, language, code } = req.body;

        if ((!teamId && !kriyaID) || !problemId || !language || !code) {
            return res.status(400).json({ msg: "teamId (or kriyaID), problemId, language, and code are required" });
        }

        // Validate language
        if (!["C", "JAVA", "PYTHON"].includes(language.toUpperCase())) {
            return res.status(400).json({ msg: "Unsupported language. Use C, JAVA, or PYTHON" });
        }

        // Fetch team — prefer MongoDB _id, fallback to kriyaID lookup
        let team;
        if (teamId) {
            team = await Team.findById(teamId);
        } else {
            team = await Team.findOne({ kriyaID: kriyaID.trim() });
        }
        if (!team) return res.status(404).json({ msg: "Team not found" });

        const problem = await Round2Question.findById(problemId);
        if (!problem) return res.status(404).json({ msg: "Problem not found" });

        // Find the problem in team's problemsStatus
        const problemEntry = team.round2.problemsStatus.find(
            (p) => p.problemId.toString() === problemId.toString()
        );
        if (!problemEntry) {
            return res.status(400).json({ msg: "This problem is not assigned to the team" });
        }

        // Edge case: reject if already SOLVED
        if (problemEntry.status === "SOLVED") {
            return res.status(400).json({ msg: "Problem already solved" });
        }

        // Get ship config for life management
        const shipConfig = getShipConfig(team.shipConfig);
        const initialLives = shipConfig ? shipConfig.round2Lives : 3;

        // If SUNK, lives have been reset — allow retry
        // (lives were reset when it was sunk, so livesLeft should already be > 0)

        // Execute code against test cases via Judge0
        const testCases = problem.testCases || [];
        const executionResult = await runTestCases(
            language.toUpperCase(),
            code,
            testCases,
            problem.timeLimitSec || 10
        );

        let lifeLost = false;
        let responseData = {};

        if (executionResult.isCompilationError) {
            // --- COMPILATION ERROR ---
            lifeLost = true;
            problemEntry.livesLeft -= 1;
            problemEntry.wrongSubmissions += 1;

            responseData = {
                verdict: "COMPILATION_ERROR",
                compilationError: executionResult.compilationError,
                livesLeft: problemEntry.livesLeft
            };
        } else if (executionResult.passed < executionResult.total) {
            // --- WRONG ANSWER (not all test cases passed) ---
            lifeLost = true;
            problemEntry.livesLeft -= 1;
            problemEntry.wrongSubmissions += 1;

            responseData = {
                verdict: "WRONG_ANSWER",
                passedTestCases: executionResult.passed,
                totalTestCases: executionResult.total,
                livesLeft: problemEntry.livesLeft
            };
        } else {
            // --- ALL TEST CASES PASS ---
            problemEntry.status = "SOLVED";

            // Calculate score: base score = 100 (can be adjusted)
            const baseScore = 100;
            const finalScore = calculateScore(baseScore, team.shipConfig);

            // Update team round2 score
            team.round2.score = (team.round2.score || 0) + finalScore;
            team.totalScore = (team.totalScore || 0) + finalScore;

            responseData = {
                verdict: "ACCEPTED",
                passedTestCases: executionResult.passed,
                totalTestCases: executionResult.total,
                score: finalScore,
                livesLeft: problemEntry.livesLeft
            };
        }

        // Check if sunk (lives exhausted before solving)
        if (problemEntry.livesLeft <= 0 && problemEntry.status !== "SOLVED") {
            problemEntry.status = "SUNK";
            // Reset lives to ship's initial count for retry
            problemEntry.livesLeft = initialLives;

            responseData.sunk = true;
            responseData.msg = "Ship has sunk! Lives reset — you can retry.";
            responseData.livesLeft = problemEntry.livesLeft;
        }

        // Save submission record
        const submission = new Round2Submission({
            teamId,
            problemId,
            language: language.toUpperCase(),
            code,
            passedTestCases: executionResult.passed || 0,
            totalTestCases: executionResult.total || 0,
            lifeLost
        });
        await submission.save();

        // Save team updates
        await team.save();

        // Sync leaderboard if solved
        if (problemEntry.status === "SOLVED") {
            await syncLeaderboard(teamId);
        }

        res.json({
            msg: "Submission processed",
            submission: {
                _id: submission._id,
                verdict: responseData.verdict,
                ...responseData
            }
        });
    } catch (err) {
        console.error("Round2 submission error:", err);
        res.status(500).json({ msg: "Error processing submission", error: err.message });
    }
};

/**
 * Open a Round 2 problem for a team.
 * Marks the problem status as ACTIVE and records the start time.
 */
export const openProblem = async (req, res) => {
    try {
        const { problemId } = req.body;
        const team = req.team;

        if (!problemId) {
            return res.status(400).json({ msg: "problemId is required" });
        }

        if (!team || !team.round2 || !Array.isArray(team.round2.problemsStatus)) {
            return res.status(400).json({ msg: "Round 2 not initialized for this team" });
        }

        const problemEntry = team.round2.problemsStatus.find(
            (p) => p.problemId.toString() === problemId.toString()
        );

        if (!problemEntry) {
            return res.status(400).json({ msg: "Problem not assigned to the team" });
        }

        if (problemEntry.status === "SOLVED") {
            return res.status(400).json({ msg: "Problem already solved" });
        }

        // Ensure only one problem is active at a time
        team.round2.problemsStatus.forEach((p) => {
            if (p.status === "ACTIVE" && p.problemId.toString() !== problemId.toString()) {
                p.status = "NOT_STARTED";
            }
        });

        problemEntry.status = "ACTIVE";
        if (!problemEntry.startTime) {
            problemEntry.startTime = new Date();
        }

        await team.save();

        res.json({ msg: "Problem opened", problemStatus: problemEntry });
    } catch (err) {
        console.error("Open problem error:", err);
        res.status(500).json({ msg: "Error opening problem", error: err.message });
    }
};

/**
 * Get all submissions for a specific team.
 */
export const getByTeam = async (req, res) => {
    try {
        const submissions = await Round2Submission.find({ teamId: req.params.id })
            .populate("problemId");
        res.json(submissions);
    } catch (err) {
        res.status(400).json({ msg: "Error fetching submissions", error: err.message });
    }
};

/**
 * Get all submissions for a specific problem.
 */
export const getByProblem = async (req, res) => {
    try {
        const submissions = await Round2Submission.find({ problemId: req.params.id })
            .populate("teamId");
        res.json(submissions);
    } catch (err) {
        res.status(400).json({ msg: "Error fetching submissions", error: err.message });
    }
};

/**
 * Update a submission by ID.
 */
export const updateSubmission = async (req, res) => {
    try {
        const submission = await Round2Submission.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        if (!submission) return res.status(404).json({ msg: "Submission not found" });
        res.json(submission);
    } catch (err) {
        res.status(400).json({ msg: "Error updating submission", error: err.message });
    }
};

/**
 * Delete a submission by ID.
 */
export const deleteSubmission = async (req, res) => {
    try {
        const submission = await Round2Submission.findByIdAndDelete(req.params.id);
        if (!submission) return res.status(404).json({ msg: "Submission not found" });
        res.json({ msg: "Submission deleted" });
    } catch (err) {
        res.status(400).json({ msg: "Error deleting submission", error: err.message });
    }
};
