import Round2Submission from "../models/round2submission.js";
import Team from "../models/Team.js";
import Round2Question from "../models/round2questions.js";
import { runTestCases } from "../services/codeExecutionService.js";
import { calculateScore, syncLeaderboard } from "../services/scoringService.js";
import { getShipConfig } from "../config/shipConfig.js";

const LANGUAGE_MAP = {
    50: "C",
    54: "CPP",
    62: "JAVA",
    71: "PYTHON"
};

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
        const { teamId, problemId, language_id, code } = req.body;

        if (!teamId || !problemId || !language_id || !code) {
            return res.status(400).json({ msg: "teamId, problemId, language_id, and code are required" });
        }

        // Validate language_id
        const language = LANGUAGE_MAP[parseInt(language_id)];
        if (!language) {
            return res.status(400).json({ msg: "Unsupported language_id. Use 50 (C), 62 (JAVA), or 71 (PYTHON)" });
        }

        // Fetch team and problem
        const team = await Team.findById(teamId);
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

        // Activate problem if not started yet
        if (problemEntry.status === "NOT_STARTED") {
            problemEntry.status = "ACTIVE";
            problemEntry.startTime = new Date();
        }

        // Get ship config for life management
        const shipConfig = getShipConfig(team.shipConfig);
        const initialLives = shipConfig ? shipConfig.round2Lives : 3;

        // Execute code against test cases via Judge0
        const testCases = problem.testCases || [];
        const executionResult = await runTestCases(
            language,
            code,
            testCases,
            problem.timeLimitSec || 10
        );

        let lifeLost = false;
        let responseData = {};

        let passedCount = executionResult.passed;
        const totalCount = executionResult.total;
        let isActuallyCorrect = passedCount === totalCount;
        let effectApplied = null;

        // --- APPLY ACTION CARD: Davy Jones’ Mercy ---
        if (!isActuallyCorrect && team.ignoreNextFailedTestcase) {
            if (passedCount === totalCount - 1) {
                isActuallyCorrect = true;
                passedCount = totalCount;
                effectApplied = "Davy Jones’ Mercy: Ignored 1 failed testcase.";
                // We'll update executionResult locally for the rest of the flow
                executionResult.passed = totalCount;
                team.ignoreNextFailedTestcase = false; // Consume only if applied successfully
            }
            // Note: If they failed more than 1 test case, the card is NOT consumed and remains for the next attempt.
        }

        // --- APPLY ACTION CARD: Spyglass Focus ---
        let shouldRevealHidden = false;
        if (team.revealFailedTestcase) {
            if (!isActuallyCorrect) {
                shouldRevealHidden = true;
                effectApplied = (effectApplied ? effectApplied + " " : "") + "Spyglass Focus: Revealed failed testcase details.";
                team.revealFailedTestcase = false; // Only consume if we actually failed
            } else {
                // If it was actually correct, we don't reveal hidden cases and don't consume the card
                shouldRevealHidden = false;
            }
        }

        if (executionResult.isCompilationError) {
            // --- COMPILATION ERROR ---
            lifeLost = true;
            if (problemEntry.livesLeft > 0) {
                problemEntry.livesLeft -= 1;
            } else {
                problemEntry.bonusLives = Math.max(0, (problemEntry.bonusLives || 0) - 1);
            }
            problemEntry.wrongSubmissions += 1;

            responseData = {
                verdict: "COMPILATION_ERROR",
                compilationError: executionResult.compilationError,
                livesLeft: problemEntry.livesLeft + (problemEntry.bonusLives || 0)
            };
        } else if (!isActuallyCorrect) {
            // --- WRONG ANSWER ---
            lifeLost = true;
            if (problemEntry.livesLeft > 0) {
                problemEntry.livesLeft -= 1;
            } else {
                problemEntry.bonusLives = Math.max(0, (problemEntry.bonusLives || 0) - 1);
            }
            problemEntry.wrongSubmissions += 1;

            responseData = {
                verdict: "WRONG_ANSWER",
                passedTestCases: passedCount,
                totalTestCases: totalCount,
                livesLeft: problemEntry.livesLeft + (problemEntry.bonusLives || 0),
                effectApplied,
                testResults: executionResult.results.map((res, index) => {
                    const isHidden = problem.testCases[index].isHidden;
                    const showDetails = !isHidden || shouldRevealHidden;
                    return {
                        input: showDetails ? res.input : "[HIDDEN]",
                        expectedOutput: showDetails ? res.expectedOutput : "[HIDDEN]",
                        actualOutput: showDetails ? res.actualOutput : "[HIDDEN]",
                        passed: res.passed,
                        status: res.statusDescription,
                        isHidden: isHidden,
                        stderr: showDetails ? res.stderr : null
                    };
                })
            };
        } else {
            // --- ALL TEST CASES PASS (OR MERCY APPLIED) ---
            problemEntry.status = "SOLVED";

            // Calculate score
            const baseScore = 100;
            const finalScore = calculateScore(baseScore, team.shipConfig);

            team.round2.score = (team.round2.score || 0) + finalScore;
            team.totalScore = (team.totalScore || 0) + finalScore;

            responseData = {
                verdict: "ACCEPTED",
                passedTestCases: passedCount,
                totalTestCases: totalCount,
                score: finalScore,
                livesLeft: problemEntry.livesLeft + (problemEntry.bonusLives || 0),
                effectApplied,
                testResults: executionResult.results.map((res, index) => {
                    const isHidden = problem.testCases[index].isHidden;
                    const showDetails = !isHidden || shouldRevealHidden;
                    return {
                        input: showDetails ? res.input : "[HIDDEN]",
                        expectedOutput: showDetails ? res.expectedOutput : "[HIDDEN]",
                        actualOutput: showDetails ? res.actualOutput : "[HIDDEN]",
                        passed: res.passed,
                        status: res.statusDescription,
                        isHidden: isHidden,
                        stderr: showDetails ? res.stderr : null
                    };
                })
            };
        }

        // Check if sunk (all lives exhausted before solving)
        if (problemEntry.livesLeft <= 0 && (problemEntry.bonusLives || 0) <= 0 && problemEntry.status !== "SOLVED") {
            problemEntry.status = "SUNK";
            // Reset lives to ship's initial count for retry, but KEEP bonusLives!
            problemEntry.livesLeft = initialLives;

            responseData.sunk = true;
            responseData.msg = "Ship has sunk! Lives reset — you can retry.";
            responseData.livesLeft = problemEntry.livesLeft + (problemEntry.bonusLives || 0);
        }

        team.markModified('round2.problemsStatus');

        // Save submission record
        const submission = new Round2Submission({
            teamId,
            problemId,
            language,
            code,
            passedTestCases: executionResult.passed || 0,
            totalTestCases: executionResult.total || 0,
            lifeLost,
            results: executionResult.results ? executionResult.results.map((res, index) => ({
                input: res.input,
                expectedOutput: res.expectedOutput,
                actualOutput: res.actualOutput,
                passed: res.passed,
                statusDescription: res.statusDescription,
                isHidden: problem.testCases[index].isHidden
            })) : []
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