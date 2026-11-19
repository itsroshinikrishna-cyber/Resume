import { mode } from "./_store.js";

export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.status(200).json({
    storage: mode,
    passcodeRequired: !!process.env.STUDIO_PASSCODE,
    generation: !!(process.env.OPENAI_API_KEY || process.env.MOCK_GENERATE),
    mock: !process.env.OPENAI_API_KEY && !!process.env.MOCK_GENERATE,
  });
}
