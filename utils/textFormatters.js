export function formatText(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getGenderText(gender) {
  switch(gender) {
    case 'm': return 'Male';
    case 'f': return 'Female';
    default: return 'Other';
  }
}