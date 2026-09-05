import type { Profile, Criteria, Offer } from "@prisma/client";
import { asStringArray, asObject } from "./json";
import type { ParsedCv } from "./cvParser";

const EMPTY_SECTIONS: ParsedCv["sections"] = {
  summary: null,
  experiences: [],
  education: [],
  languages: [],
};

export function serializeProfile(profile: Profile | null) {
  if (!profile) return null;
  return {
    ...profile,
    cvSkills: asStringArray(profile.cvSkills),
    cvSections: asObject(profile.cvSections, EMPTY_SECTIONS),
  };
}

export function serializeCriteria(criteria: Criteria | null) {
  if (!criteria) return null;
  return {
    ...criteria,
    jobTitles: asStringArray(criteria.jobTitles),
    locations: asStringArray(criteria.locations),
    contractTypes: asStringArray(criteria.contractTypes),
    keywords: asStringArray(criteria.keywords),
    excludeKeywords: asStringArray(criteria.excludeKeywords),
  };
}

export function serializeOffer(offer: Offer) {
  return {
    ...offer,
    requiredSkills: asStringArray(offer.requiredSkills),
    matchedSkills: asStringArray(offer.matchedSkills),
    missingSkills: asStringArray(offer.missingSkills),
  };
}
