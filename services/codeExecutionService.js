/**
 * Code Execution Service — Judge0 API integration
 *
 * Self-hosted Judge0 instance at configurable URL.
 * Supports C (50), Java (62), Python (71).
 */

import https from "https";
import fetch from "node-fetch";

const LANGUAGE_IDS = {
    C: 50,
    JAVA: 62,
    PYTHON: 71
};

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Execute code against a single test case via Judge0.
 * @param {number|string} language - language_id (50/62/71) OR name "C"/"JAVA"/"PYTHON"
 * @param {string} sourceCode - The source code to execute
 * @param {string} stdin - The input to feed to the program
 * @param {number} timeLimitSec - Time limit in seconds
 * @returns {Promise<{stdout, stderr, compile_output, status, time, memory}>}
 */
export async function executeCode(language, sourceCode, stdin, timeLimitSec = 10) {
    const JUDGE0_URL = process.env.JUDGE0_API_URL || "http://10.1.22.141:2358";

    // Accept either language_id number or language name string
    const languageId = typeof language === "number"
        ? language
        : LANGUAGE_IDS[language.toUpperCase()];

    if (!languageId) {
        throw new Error(`Unsupported language: ${language}. Supported: 50 (C), 62 (JAVA), 71 (PYTHON)`);
    }

    const payload = {
        language_id: languageId,
        source_code: sourceCode,
        stdin: stdin || "",
        cpu_time_limit: Math.min(timeLimitSec, 15)
    };

    const response = await fetch(
        `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            agent: httpsAgent
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Judge0 API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        compile_output: result.compile_output || "",
        status: result.status,
        time: result.time,
        memory: result.memory
    };
}

/**
 * Run code against multiple test cases sequentially.
 * Stops on first compilation error.
 * @param {number|string} language
 * @param {string} sourceCode
 * @param {Array<{input: string, output: string}>} testCases
 * @param {number} timeLimitSec
 * @returns {Promise<{passed, total, isCompilationError, compilationError, results}>}
 */
export async function runTestCases(language, sourceCode, testCases, timeLimitSec = 10) {
    let passed = 0;
    const total = testCases.length;
    const results = [];

    for (const testCase of testCases) {
        const result = await executeCode(language, sourceCode, testCase.input, timeLimitSec);

        // Judge0 status IDs:
        // 1 = In Queue, 2 = Processing, 3 = Accepted,
        // 4 = Wrong Answer, 5 = Time Limit Exceeded,
        // 6 = Compilation Error, 7-12 = Runtime errors
        const statusId = result.status?.id;

        // Compilation error — stop immediately
        if (statusId === 6) {
            return {
                passed,
                total,
                isCompilationError: true,
                compilationError: result.compile_output || result.stderr,
                results
            };
        }

        const actualOutput = (result.stdout || "").trim();
        const expectedOutput = (testCase.output || "").trim();
        const isCorrect = statusId === 3 && actualOutput === expectedOutput;

        if (isCorrect) passed++;

        results.push({
            input: testCase.input,
            expectedOutput: testCase.output,
            actualOutput: result.stdout,
            passed: isCorrect,
            statusId,
            statusDescription: result.status?.description,
            time: result.time,
            memory: result.memory,
            stderr: result.stderr
        });
    }

    return {
        passed,
        total,
        isCompilationError: false,
        compilationError: null,
        results
    };
}