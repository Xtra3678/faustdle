import { haki, arcs } from '../data/characters.js';
import { formatText, getGenderText } from './textFormatters.js';
import { compareNumbers } from './numberComparison.js';

export function compareTraits(guessTraits, chosenTraits) {
  const results = [];
  
  for (let i = 0; i < guessTraits.length; i++) {
    if (i === 9) continue; // Skip the last trait
    
    // Special handling for bounty (index 4)
    if (i === 4 && (guessTraits[i] === "1" || chosenTraits[i] === "1")) {
      results.push({
        match: false,
        text: "Unknown Bounty"
      });
      continue;
    }
    
    if (guessTraits[i] === chosenTraits[i]) {
      results.push(createMatchResult(guessTraits[i], i));
    } else {
      results.push(createNonMatchResult(guessTraits[i], chosenTraits[i], i));
    }
  }
  
  return results;
}

function createMatchResult(trait, index) {
  return {
    match: true,
    text: formatTraitText(trait, index)
  };
}

function createNonMatchResult(guessTrait, chosenTrait, index) {
  if (guessTrait.match(/^\d+$/)) {
    return createNumberComparisonResult(guessTrait, chosenTrait, index);
  }
  return createTextComparisonResult(guessTrait, index);
}

function formatTraitText(trait, index) {
  switch(index) {
    case 0: return getGenderText(trait);
    case 3: return formatText(haki[parseInt(trait)]);
    case 7: return formatText(arcs[parseInt(trait)]);
    default: return formatText(trait);
  }
}

function createNumberComparisonResult(guessTrait, chosenTrait, index) {
  if (index === 3) {
    return {
      match: false,
      text: formatText(haki[parseInt(guessTrait)])
    };
  }
  
  if (index === 7) {
    return {
      match: false,
      direction: compareNumbers(parseInt(guessTrait), parseInt(chosenTrait)),
      text: formatText(arcs[parseInt(guessTrait)])
    };
  }
  
  return {
    match: false,
    direction: compareNumbers(parseInt(guessTrait), parseInt(chosenTrait)),
    text: guessTrait
  };
}

function createTextComparisonResult(trait, index) {
  if (index === 0) {
    return {
      match: false,
      text: getGenderText(trait)
    };
  }
  
  if (index === 5) {
    return {
      match: false,
      text: "Unknown Height"
    };
  }
  
  return {
    match: false,
    text: formatText(trait)
  };
}