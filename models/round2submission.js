import mongoose from "mongoose";

const round2SubmissionSchema = new mongoose.Schema({
    teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        required: true
    },
    problemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Round2Question",
        required: true
    },
    language: {
        type: String,
        enum: ["C", "JAVA", "PYTHON"],
        required: true
    },
    code: {
        type: String,
        required: true
    },
    passedTestCases: {
        type: Number,
        default: 0
    },
    totalTestCases: {
        type: Number,
        default: 0
    },
    lifeLost: {
        type: Boolean,
        default: false
    },
    results: [
        {
            input: String,
            expectedOutput: String,
            actualOutput: String,
            passed: Boolean,
            statusDescription: String,
            isHidden: Boolean
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model("Round2Submission", round2SubmissionSchema);
