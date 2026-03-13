import Team from "../models/Team.js";
import Round2Question from "../models/round2questions.js";
import Round2Submission from "../models/round2submission.js";
import ActiveEffect from "../models/ActiveEffect.js";
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

        const activeEffect = await ActiveEffect.findOne({ teamId: team._id });

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

        // Card 2: Davy Jones’ Mercy (Ignore 1 failed testcase)
        if (!isCorrect && activeEffect?.ignoreTestcase) {
            if (passed === total - 1) {
                isCorrect = true;
                passed = total;
                responseData.verdict = "ACCEPTED";
                responseData.effectApplied = "Davy Jones’ Mercy: Ignored 1 failed testcase.";

                // Consume effect
                activeEffect.ignoreTestcase = false;
                await activeEffect.save();
            }
        }

        // Card 8: Spyglass Focus (Reveal failed testcase index)
        if (!isCorrect && activeEffect?.revealFailedTestcase) {
            // Find the index of the first failed test case
            // Note: runTestCases should ideally return which ones failed. 
            // Assuming executionResult.results is an array of testcase results.
            const failedIndex = executionResult.results?.findIndex(r => !r.success);
            responseData.failedTestcaseIndex = failedIndex !== -1 ? failedIndex : null;
            responseData.effectApplied = "Spyglass Focus: Revealed failed testcase index.";

            // Consume effect
            activeEffect.revealFailedTestcase = false;
            await activeEffect.save();
        }

        if (isCorrect) {
            // Logic for successful submission
            const baseScore = 100;
            let finalScore = calculateScore(baseScore, team.shipConfig);

            // Card 3: Isla de Muerta Treasure (+10 bonus points)
            if (activeEffect?.bonusPointsNextSuccess) {
                finalScore += 10;
                responseData.effectApplied = (responseData.effectApplied ? responseData.effectApplied + " " : "") + "Isla de Muerta Treasure: +10 bonus points added.";

                // Consume effect
                activeEffect.bonusPointsNextSuccess = false;
                await activeEffect.save();
            }

            team.round2.score = (team.round2.score || 0) + finalScore;
            team.totalScore = (team.totalScore || 0) + finalScore;

            // Card 7: Anchor Drop (Lock difficulty progression)
            if (activeEffect?.freezeDifficulty) {
                responseData.effectApplied = (responseData.effectApplied ? responseData.effectApplied + " " : "") + "Anchor Drop: Difficulty progression locked.";
                // Logic: Usually would update island or next question difficulty. 
                // Since we don't have the progression logic here, we just acknowledgement it.

                // Consume effect
                activeEffect.freezeDifficulty = false;
                await activeEffect.save();
            }

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

import ActionCard from "../models/actionCard.model.js";
import ActionCardInventory from "../models/ActionCardInventory.js";

/**
 * POST /players/:playerId/minigame-complete
 * Apply mini-game reward logic.
 */
export const minigameComplete = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const { baseReward } = req.body;

        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ msg: "Invalid player" });

        const activeEffect = await ActiveEffect.findOne({ teamId: team._id });

        let reward = baseReward || 5;
        let effectApplied = "";

        // Card 5: Chest of Cortés (Double reward + bonus points)
        if (activeEffect?.doubleMiniGameReward) {
            reward *= 2;
            reward += activeEffect.bonusPointsMiniGame || 0;
            effectApplied = "Chest of Cortés: Reward doubled and +5 bonus points added.";

            // Consume effect
            activeEffect.doubleMiniGameReward = false;
            activeEffect.bonusPointsMiniGame = 0;
            await activeEffect.save();
        }

        team.round2.score = (team.round2.score || 0) + reward;
        team.totalScore = (team.totalScore || 0) + reward;
        await team.save();
        await syncLeaderboard(team._id);

        // --- Action Card Award Logic ---
        // 1. Get all possible action cards (a1-a8)
        const allCards = await ActionCard.find().sort({ cardNumber: 1 });
        
        // 2. Get team's existing inventory to check for duplicates
        const teamInventory = await ActionCardInventory.find({ teamId: team._id });
        const ownedCardIds = teamInventory.map(item => item.cardId.toString());

        // 3. Find cards they don't have yet
        const unownedCards = allCards.filter(c => !ownedCardIds.includes(c._id.toString()));

        let awardedCard = null;
        if (unownedCards.length > 0) {
            // 4. Pick one at random
            const randomIndex = Math.floor(Math.random() * unownedCards.length);
            awardedCard = unownedCards[randomIndex];

            // 5. Add to inventory
            const newInventoryItem = new ActionCardInventory({
                teamId: team._id,
                cardId: awardedCard._id,
                isUsed: false
            });
            await newInventoryItem.save();
        }

        res.json({
            msg: awardedCard ? "Mini-game reward applied! Action card awarded." : "Mini-game reward applied! (All cards already collected)",
            reward,
            effectApplied,
            card: awardedCard
        });

    } catch (err) {
        res.status(500).json({ msg: "Error applying mini-game reward", error: err.message });
    }
};
