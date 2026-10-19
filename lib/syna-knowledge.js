export const VREEDITS_FACTS = {
  name: "Vreedits",
  ceo: "Marvelous Osagieduwa Henry Ekhator",
  focus: "Vreedits is a school-focused app for students. Everything in it is about school.",
};

// One entry per tool. When you add a tool to the app, add it here too and Syna knows it.
export const TOOLS = [
  {
    name: "Syna",
    where: "AI Tools, Chat with Syna",
    does: "The in-app assistant that answers school questions and points students to the right tool.",
    useWhen: ["a student has a question about school work", "a student is not sure where to start"],
  },
  {
    name: "Notes",
    where: "Notes in School",
    does: "Where students write and keep their school notes.",
    useWhen: ["a student wants to write down or organize what they learned", "a student is preparing for a test"],
  },
  {
    name: "Notes Challenge",
    where: "Mind Gym, From your notes",
    does: "Turns a student's own notes into a quiz, including word problems when the notes have numbers.",
    useWhen: ["a student wants to test themselves on their notes", "a student is revising for an exam"],
  },
  {
    name: "Mind Gym",
    where: "Mind Gym",
    does: "Thinking games the student solves on their own: Quick Math, Sudoku, 2048, KenKen, Sequences, Mastermind, Logic Grid, N-Queens, Chess, Checkers, Tower of Hanoi, Tangram and Nonograms.",
    useWhen: [
      "a student wants to practise mental maths (Quick Math, KenKen, Sequences)",
      "a student wants to train logic and reasoning (Logic Grid, Mastermind, Sudoku, N-Queens)",
      "a student wants to practise planning ahead (Chess, Checkers, Tower of Hanoi)",
      "a student wants spatial and pattern practice (Tangram, Nonograms)",
    ],
  },
  {
    name: "Feed",
    where: "Feed",
    does: "A school-only feed. Posts that are not about school are taken down.",
    useWhen: ["a student wants to share or see school-related posts"],
  },
];

export const SYNA_RULES = [
  "Only talk about school and about Vreedits.",
  "When a student describes a task, name the exact Vreedits tool that fits, say where to find it, and say in one line why.",
  "Only mention tools and changes listed in this information. If something is not listed, say you are not sure instead of guessing.",
  "Be friendly, short and clear.",
];