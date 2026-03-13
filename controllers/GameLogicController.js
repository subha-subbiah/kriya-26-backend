import Team from "../models/Team.js";
import Round2Question from "../models/round2questions.js";
import Round2Submission from "../models/round2submission.js";
import { runTestCases } from "../services/codeExecutionService.js";
import { calculateScore, syncLeaderboard } from "../services/scoringService.js";
import { getShipConfig } from "../config/shipConfig.js";
import { awardRandomCard } from "./actionCardController.js";

/**
 * POST /players/:kriyaID/submit
 * Submit a solution for a coding question.
 * (Note: Primary logic is now in round2SubmissionController.js, 
 * but keeping this for compatibility or specific game logic triggers)
 */
export const submitSolution = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const { problemId, language, code } = req.body;

        if (!problemId || !language || !code) {
            return res.status(400).json({ msg: "problemId, language, and code are required" });
        }

        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ msg: "Invalid player" });

        const problem = await Round2Question.findById(problemId);
        if (!problem) return res.status(404).json({ msg: "Invalid question" });

        // Execute code
        const testCases = problem.testCases || [];
        const executionResult = await runTestCases(
            language.toUpperCase(),
            code,
            testCases,
            problem.timeLimitSec || 10
        );

        let passed = executionResult.passed || 0;
        const total = executionResult.total || 0;
        let isCorrect = passed === total;
        let responseData = {
            passed,
            total,
            verdict: isCorrect ? "ACCEPTED" : "WRONG_ANSWER"
        };

        // Apply Davy Jones’ Mercy (Ignore 1 failed testcase)
        if (!isCorrect && team.ignoreNextFailedTestcase) {
            if (passed === total - 1) {
                isCorrect = true;
                passed = total;
                responseData.verdict = "ACCEPTED";
                responseData.effectApplied = "Davy Jones’ Mercy: Ignored 1 failed testcase.";
                team.ignoreNextFailedTestcase = false;
            }
            // Else: Leave card for next attempt
        }

        // Apply Spyglass Focus (Reveal failed testcase index)
        if (!isCorrect && team.revealFailedTestcase) {
            const failedIndex = executionResult.results?.findIndex(r => !r.success);
            responseData.failedTestcaseIndex = failedIndex !== -1 ? failedIndex : null;
            responseData.effectApplied = (responseData.effectApplied ? responseData.effectApplied + " " : "") + "Spyglass Focus: Revealed failed testcase details.";
            team.revealFailedTestcase = false;
        }
        await team.save();

        if (isCorrect) {
            const baseScore = 100;
            let finalScore = calculateScore(baseScore, team.shipConfig);
            team.round2.score = (team.round2.score || 0) + finalScore;
            team.totalScore = (team.totalScore || 0) + finalScore;
            
            const problemEntry = team.round2.problemsStatus.find(p => p.problemId.toString() === problemId.toString());
            if (problemEntry) {
                responseData.livesLeft = problemEntry.livesLeft + (problemEntry.bonusLives || 0);
            }
            team.markModified('round2.problemsStatus');
            await team.save();
            await syncLeaderboard(team._id);
            responseData.score = finalScore;
        } else {
            const problemEntry = team.round2.problemsStatus.find(p => p.problemId.toString() === problemId.toString());
            if (problemEntry) {
                if (problemEntry.livesLeft > 0) {
                    problemEntry.livesLeft -= 1;
                } else {
                    problemEntry.bonusLives = Math.max(0, (problemEntry.bonusLives || 0) - 1);
                }

                if (problemEntry.livesLeft <= 0 && (problemEntry.bonusLives || 0) <= 0) {
                    problemEntry.status = "SUNK";
                    const shipConfig = getShipConfig(team.shipConfig);
                    problemEntry.livesLeft = shipConfig ? shipConfig.round2Lives : 3;
                }
                team.markModified('round2.problemsStatus');
                await team.save();
                responseData.livesLeft = problemEntry.livesLeft + (problemEntry.bonusLives || 0);
            }
        }

        const submission = new Round2Submission({
            teamId: team._id,
            problemId,
            language: language.toUpperCase(),
            code,
            passedTestCases: passed,
            totalTestCases: total,
            lifeLost: !isCorrect
        });
        await submission.save();

        res.json(responseData);
    } catch (err) {
        res.status(500).json({ msg: "Error processing submission", error: err.message });
    }
};

/**
 * POST /players/:kriyaID/minigame-complete
 * Apply mini-game reward logic.
 */
export const minigameComplete = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const { baseReward } = req.body;

        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ msg: "Invalid player" });

        let rewardPoints = baseReward || 5;

        team.round2.score = (team.round2.score || 0) + rewardPoints;
        team.totalScore = (team.totalScore || 0) + rewardPoints;

        // Award action card
        const awardedCard = await awardRandomCard(team);

        await team.save();
        await syncLeaderboard(team._id);

        res.json({
            msg: "Mini-game reward applied",
            reward: rewardPoints,
            card: awardedCard // Object with name and description
        });

    } catch (err) {
        res.status(500).json({ msg: "Error applying mini-game reward", error: err.message });
    }
};

