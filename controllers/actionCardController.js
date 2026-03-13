import Team from "../models/Team.js";

const ACTION_CARDS = [
    "Black Pearl’s Resurgence",
    "Captain’s Hidden Map",
    "Davy Jones’ Mercy",
    "Spyglass Focus"
];

/**
 * POST /api/actionCards/claim/:kriyaID
 */
export const claimActionCard = async (req, res) => {
    try {
        const { kriyaID } = req.params;
        const team = await Team.findOne({ kriyaID });
        if (!team) return res.status(404).json({ success: false, msg: "Team not found" });

        // Constraint: Max 2 action cards claimed
        if (team.claimedActionCards && team.claimedActionCards.length >= 2) {
            return res.status(400).json({ success: false, msg: "Maximum of 2 action cards can be claimed at a time." });
        }

        // Constraint: Do not claim an action card already in claimedActionCards
        const availableCards = ACTION_CARDS.filter(card => !team.claimedActionCards.includes(card));

        if (availableCards.length === 0) {
            return res.status(400).json({ success: false, msg: "No more unique action cards available to claim." });
        }

        const randomIndex = Math.floor(Math.random() * availableCards.length);
        const claimedCard = availableCards[randomIndex];

        team.claimedActionCards.push(claimedCard);
        await team.save();

        res.json({
            success: true,
            claimedCard
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

        res.json({
            claimedActionCards: team.claimedActionCards || []
        });
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

        let effectMessage = "";

        // Apply Card Effect
        switch (cardName) {
            case "Black Pearl’s Resurgence":
                if (team.round2 && Array.isArray(team.round2.problemsStatus)) {
                    team.round2.problemsStatus.forEach(problem => {
                        problem.livesLeft += 2;
                    });
                    effectMessage = "Gain 2 extra lives. Added to all problems.";
                } else {
                    return res.status(400).json({ msg: "Round 2 problems not initialized" });
                }
                break;

            case "Captain’s Hidden Map":
                effectMessage = "Ask a volunteer for a hint.";
                break;

            case "Davy Jones’ Mercy":
                team.ignoreNextFailedTestcase = true;
                effectMessage = "Ignore 1 failed testcase on the next submission.";
                break;

            case "Spyglass Focus":
                team.revealFailedTestcase = true;
                effectMessage = "Reveal which testcase failed when the next submission fails.";
                break;

            default:
                return res.status(400).json({ msg: "Unknown action card" });
        }

        // Move from claimed to used
        team.claimedActionCards.splice(cardIndex, 1);
        team.usedActionCards.push(cardName);

        await team.save();

        res.json({
            success: true,
            message: effectMessage,
            cardName
        });
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
