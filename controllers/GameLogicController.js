import Team from "../models/Team.js";
import Round2Question from "../models/round2questions.js";
import Round2Submission from "../models/round2submission.js";
import ActiveEffect from "../models/ActiveEffect.js";
import ActionCard from "../models/actionCard.model.js";
import ActionCardInventory from "../models/ActionCardInventory.js";
import { runTestCases } from "../services/codeExecutionService.js";
import { calculateScore, syncLeaderboard } from "../services/scoringService.js";
import { getShipConfig } from "../config/shipConfig.js";

/**
 * POST /players/:playerId/submit
 * Submit a solution for a coding question.
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

        // Card: Davy Jones’ Mercy (Ignore 1 failed testcase)
        if (!isCorrect && team.ignoreNextFailedTestcase) {
            if (passed === total - 1) {
                isCorrect = true;
                passed = total;
                responseData.verdict = "ACCEPTED";
                responseData.effectApplied = "Davy Jones’ Mercy: Ignored 1 failed testcase.";

                // Consume effect
                team.ignoreNextFailedTestcase = false;
                await team.save();
            } else {
                // If more than 1 testcase failed, effect is still consumed but submission remains incorrect
                team.ignoreNextFailedTestcase = false;
                await team.save();
            }
        }

        // Card: Spyglass Focus (Reveal failed testcase index)
        if (!isCorrect && team.revealFailedTestcase) {
            const failedIndex = executionResult.results?.findIndex(r => !r.success);
            responseData.failedTestcaseIndex = failedIndex !== -1 ? failedIndex : null;
            responseData.effectApplied = (responseData.effectApplied ? responseData.effectApplied + " " : "") + "Spyglass Focus: Revealed failed testcase index.";

            // Consume effect
            team.revealFailedTestcase = false;
            await team.save();
        }

        if (isCorrect) {
            // Logic for successful submission
            const baseScore = 100;
            let finalScore = calculateScore(baseScore, team.shipConfig);

            team.round2.score = (team.round2.score || 0) + finalScore;
            team.totalScore = (team.totalScore || 0) + finalScore;

            await team.save();
            await syncLeaderboard(team._id);

            responseData.score = finalScore;
        } else {
            // Handle life loss
            const problemEntry = team.round2.problemsStatus.find(p => p.problemId.toString() === problemId.toString());
            if (problemEntry) {
                problemEntry.livesLeft -= 1;
                if (problemEntry.livesLeft <= 0) {
                    problemEntry.status = "SUNK";
                    const shipConfig = getShipConfig(team.shipConfig);
                    problemEntry.livesLeft = shipConfig ? shipConfig.round2Lives : 3; // Reset for retry
                }
                await team.save();
                responseData.livesLeft = problemEntry.livesLeft;
            }
        }

        // Save submission record
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
 * POST /players/:playerId/minigame-complete
 * Apply mini-game reward logic. (Simplified as per requirements)
 */
export const minigameComplete = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const { baseReward } = req.body;

        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ msg: "Invalid player" });

        let reward = baseReward || 5;

        team.round2.score = (team.round2.score || 0) + reward;
        team.totalScore = (team.totalScore || 0) + reward;

        let actionCard = null;
        try {
            const totalActionCards = await ActionCard.countDocuments();
            if (totalActionCards > 0) {
                const randomIndex = Math.floor(Math.random() * totalActionCards);
                actionCard = await ActionCard.findOne().skip(randomIndex);

                if (actionCard) {
                    await ActionCardInventory.create({
                        teamId: team._id,
                        cardId: actionCard._id,
                    });
                }
            }
        } catch (awardErr) {
            console.error("Error awarding action card in minigame:", awardErr);
        }

        await team.save();
        await syncLeaderboard(team._id);

        res.json({
            msg: "Mini-game reward applied",
            reward,
            effectApplied,
            card: actionCard // Return the awarded action card
            reward
        });

    } catch (err) {
        res.status(500).json({ msg: "Error applying mini-game reward", error: err.message });
    }
};
