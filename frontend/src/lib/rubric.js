/**
 * The Review 2 rubric, and an honest audit of what the project can evidence.
 *
 * THE DATA LIVES IN rubric.json, not here. Both the /rubric page and
 * scripts/build_rubric_deck.py read that one file, so the app and the deck
 * cannot disagree about what is done. (They did disagree once — the Python
 * script carried its own copy of the table and went stale the moment the
 * statuses changed. Hence the single source.)
 *
 * Status rules, so the page stays useful rather than flattering:
 *
 *   have    — the artefact exists NOW and can be pointed at: a specific deck
 *             slide, a page in this app, or a file in the repo.
 *   partial — some of the required parts exist; the missing parts are listed
 *             explicitly in `missing`.
 *   todo    — nothing exists yet.
 *
 * Slide references were read out of CB.SC.U4CSE23134.pptx with python-pptx,
 * not guessed.
 */
import data from "./rubric.json";

export const RUBRIC = data.rubric;

export const TOTAL_MARKS = RUBRIC.reduce((s, r) => s + r.marks, 0);

export const marksBy = (status) =>
  RUBRIC.filter((r) => r.status === status).reduce((s, r) => s + r.marks, 0);

export const STATUS_META = data.statusMeta;
