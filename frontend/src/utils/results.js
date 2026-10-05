// Chat shows the best few options first; the rest are a click or a
// "show more" away instead of a wall of cards.
export const SHOWN_RESULTS = 3;

// "show more", "more options", "see more please", "more"...
export function asksForMore(text = '') {
  return /^\s*(please\s+)?((show|see|view|give)\s+)?(me\s+)?(some\s+)?more(\s+(options|results|ones))?(\s+please)?\s*[.!?]*\s*$/i.test(text);
}
