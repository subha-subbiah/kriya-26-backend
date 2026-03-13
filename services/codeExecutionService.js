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
    CPP: 54,
    JAVA: 62,
    PYTHON: 71
};

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Normalizes "polluted" test case data (e.g., 's = "abc"' -> 'abc')
 * This handles variable assignments and surrounding quotes.
 */
function normalizeValue(val) {
    if (val === undefined || val === null) return "";
    let str = String(val).trim();
    
    // 1. Handle multiple variables if present (e.g., "x = 5, n = 2")
    // Split by comma, but be careful not to split inside strings (though problem inputs usually aren't that complex)
    const parts = str.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    const cleaned = parts.map(p => {
        let trimmed = p.trim();
        // 2. Remove "var =" prefix if it exists
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            // Check if there's alphanumeric text before '=' (to avoid catching strings that just happen to have '=')
            const before = trimmed.substring(0, eqIdx).trim();
            if (before.length > 0 && /^[a-zA-Z0-9_\s\[\]]+$/.test(before)) {
                trimmed = trimmed.substring(eqIdx + 1).trim();
            }
        }
        
        // 3. Remove surrounding quotes
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            trimmed = trimmed.substring(1, trimmed.length - 1);
        } else if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            trimmed = trimmed.substring(1, trimmed.length - 1);
        }
        return trimmed;
    });

    return cleaned.join('\n'); // Join with newline for multi-input programs (scanf/fgets)
}

/**
 * Execute code against a single test case via Judge0.
 * @param {number|string} language - language_id (50/62/71) OR name "C"/"JAVA"/"PYTHON"
 * @param {string} sourceCode - The source code to execute
 * @param {string} stdin - The raw input to feed to the program
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

    // --- NORMALIZATION: Clean the stdin if it looks like "var = val" ---
    const cleanStdin = normalizeValue(stdin);

    const payload = {
        language_id: languageId,
        source_code: sourceCode,
        stdin: cleanStdin,
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
        // --- NORMALIZATION: Clean the expected output string ---
        const expectedOutput = normalizeValue(testCase.output);
        
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