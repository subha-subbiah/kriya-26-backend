import mongoose from "mongoose";
import dotenv from "dotenv";
import ActionCard from "./models/actionCard.model.js";

dotenv.config();

const cards = [
    {
        cardNumber: 1,
        name: "Black Pearl’s Resurgence",
        description: "Gain 2 extra lives for all questions.",
        effectType: "EXTRA_LIVES",
        effectValue: 2
    },
    {
        cardNumber: 2,
        name: "Davy Jones’ Mercy",
        description: "Ignore 1 failed testcase on your next submission.",
        effectType: "IGNORE_FAILED_TESTCASE",
        effectValue: 1
    },
    {
        cardNumber: 3,
        name: "Isla de Muerta Treasure",
        description: "+10 bonus points if the next question is solved successfully.",
        effectType: "BONUS_POINTS_NEXT",
        effectValue: 10
    },
    {
        cardNumber: 4,
        name: "Captain’s Hidden Map",
        description: "Reveals a hint for the current active question.",
        effectType: "REVEAL_HINT",
        effectValue: null
    },
    {
        cardNumber: 5,
        name: "Chest of Cortés",
        description: "Next mini-game reward will be doubled and +5 bonus points added.",
        effectType: "DOUBLE_MINIGAME_REWARD",
        effectValue: 5
    },
    {
        cardNumber: 6,
        name: "Turn the Tide",
        description: "Swap the current active question for another one of the same difficulty.",
        effectType: "SWAP_QUESTION",
        effectValue: null
    },
    {
        cardNumber: 7,
        name: "Anchor Drop",
        description: "Lock difficulty progression for the next question.",
        effectType: "FREEZE_DIFFICULTY",
        effectValue: null
    },
    {
        cardNumber: 8,
        name: "Spyglass Focus",
        description: "Reveal which testcase failed on the next run.",
        effectType: "REVEAL_FAILED_TESTCASE",
        effectValue: null
    }
];

const seedCards = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB for seeding...");

        for (const card of cards) {
            await ActionCard.findOneAndUpdate(
                { cardNumber: card.cardNumber },
                card,
                { upsert: true, new: true }
            );
        }

        console.log("Action cards seeded successfully! ✅");
        process.exit(0);
    } catch (err) {
        console.error("Error seeding action cards:", err);
        process.exit(1);
    }
};

seedCards();
