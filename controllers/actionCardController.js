import Team from "../models/Team.js";

export const ACTION_CARDS = {
    "Black Pearl’s Resurgence": {
        description: "Gain 2 extra lives on all assigned problems.",
        effect: async (team) => {
            // Lazy-initialization if problemsStatus is empty but scrolls exist
            if ((!team.round2.problemsStatus || team.round2.problemsStatus.length === 0) && team.round1.selectedScrolls?.length > 0) {
                console.log(`Auto-initializing problemsStatus for team: ${team.teamName}`);
                const Round2Question = (await import("../models/round2questions.js")).default;
                const AlgorithmCard = (await import("../models/AlgorithmCard.js")).default;
                const { getShipConfig } = await import("../config/shipConfig.js");
                
                const shipConfig = getShipConfig(team.shipConfig);
                const initialLives = shipConfig ? shipConfig.round2Lives : 3;

                const problemsStatus = [];
                for (const scroll of team.round1.selectedScrolls) {
                    const algo = await AlgorithmCard.findOne({ name: scroll.name });
                    if (!algo) continue;
                    const problem = await Round2Question.findOne({ allowedAlgorithms: algo._id });
                    if (problem) {
                        problemsStatus.push({
                            problemId: problem._id,
                            livesLeft: initialLives,
                            bonusLives: 2, 
                            wrongSubmissions: 0,
                            status: "NOT_STARTED"
                        });
                    }
                }
                if (problemsStatus.length > 0) {
                    team.round2.problemsStatus = problemsStatus;
                    team.markModified('round2.problemsStatus');
                    return "Gain 2 extra lives. Added to all problems (Initialization Success).";
                }
            }

            if (team.round2 && Array.isArray(team.round2.problemsStatus) && team.round2.problemsStatus.length > 0) {
                team.round2.problemsStatus.forEach(problem => {
                    problem.bonusLives = (problem.bonusLives || 0) + 2;
                });
                team.markModified('round2.problemsStatus');
                return "Gain 2 extra lives. Added to all problems.";
            }
            throw new Error("Round 2 has not started yet. Plot your course on the map first!");
        }
    },
    "Captain’s Hidden Map": {
        description: "Ask a volunteer for a hint on your current problem.",
        effect: () => "Ask a volunteer for a hint."
    },
    "Davy Jones’ Mercy": {
        description: "Your next submission will pass even if it fails exactly one test case.",
        effect: (team) => {
            team.ignoreNextFailedTestcase = true;
            return "Ignore 1 failed testcase on the next submission.";
        }
    },
    "Spyglass Focus": {
        description: "The next time you fail a submission, the hidden test case details will be revealed.",
        effect: (team) => {
            team.revealFailedTestcase = true;
            return "Reveal which testcase failed when the next submission fails.";
        }
    }
};

/**
 * Helper to award a random action card to a team
 */
export const awardRandomCard = async (team) => {
    // Constraint: Max 2 action cards claimed
    if (team.claimedActionCards && team.claimedActionCards.length >= 2) {
        return null;
    }

    const allCardNames = Object.keys(ACTION_CARDS);
    const availableCards = allCardNames.filter(card => 
        !team.claimedActionCards.includes(card) && 
        !(team.usedActionCards || []).includes(card)
    );

    if (availableCards.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * availableCards.length);
    const claimedCard = availableCards[randomIndex];

    team.claimedActionCards.push(claimedCard);
    await team.save();
    return { name: claimedCard, ...ACTION_CARDS[claimedCard] };
};

/**
 * POST /api/actionCards/claim/:kriyaID
 */
export const claimActionCard = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ success: false, msg: "Team not found" });

        const awarded = await awardRandomCard(team);
        if (!awarded) {
            return res.status(400).json({ 
                success: false, 
                msg: "Cannot claim more cards (Limit 2 or all unique cards collected)." 
            });
        }

        res.json({
            success: true,
            claimedCard: awarded.name,
            description: awarded.description
        });
    } catch (err) {
        res.status(500).json({ success: false, msg: "Error claiming action card", error: err.message });
    }
};

/**
 * GET /api/actionCards/claimed/:kriyaID
 */
export const getClaimedCards = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ msg: "Team not found" });

        const cards = (team.claimedActionCards || []).map(name => ({
            name,
            description: ACTION_CARDS[name]?.description || "No description available"
        }));

        res.json({ claimedActionCards: cards });
    } catch (err) {
        res.status(500).json({ msg: "Error fetching claimed cards", error: err.message });
    }
};

/**
 * POST /api/actionCards/activate/:kriyaID
 */
export const activateActionCard = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const { cardName } = req.body;

        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ msg: "Team not found" });

        const cardIndex = team.claimedActionCards.indexOf(cardName);
        if (cardIndex === -1) {
            return res.status(400).json({ msg: "Card not in claimed inventory" });
        }

        const cardDef = ACTION_CARDS[cardName];
        if (!cardDef) return res.status(400).json({ msg: "Unknown action card" });

        try {
            const effectMessage = await cardDef.effect(team);
            
            // Move from claimed to used
            team.claimedActionCards.splice(cardIndex, 1);
            team.usedActionCards.push(cardName);

            await team.save();

            res.json({
                success: true,
                message: effectMessage,
                cardName
            });
        } catch (effectErr) {
            return res.status(400).json({ msg: effectErr.message });
        }
    } catch (err) {
        res.status(500).json({ msg: "Error activating action card", error: err.message });
    }
};

/**
 * GET /api/actionCards/used/:kriyaID
 */
export const getUsedCards = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ msg: "Team not found" });

        res.json({
            usedActionCards: team.usedActionCards || []
        });
    } catch (err) {
        res.status(500).json({ msg: "Error fetching used cards", error: err.message });
    }
};

