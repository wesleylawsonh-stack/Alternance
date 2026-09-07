// Preparation automatique de candidatures (CV adapte + message), en file
// d'attente de validation - voir ApplicationDraft dans prisma/schema.prisma.
// REGLE ABSOLUE : cette fonction ne declenche jamais un envoi reel. Elle se
// contente de generer le contenu et de le stocker avec le statut PENDING ;
// c'est une action explicite de l'utilisateur (voir /api/application-drafts/
// [id]/send) qui declenche l'envoi ou la mise a jour du statut de l'offre.

import { prisma } from "./db";
import { asStringArray, asObject, toJsonString } from "./json";
import { proposeCvEdits, generateApplicationMessage } from "./ai";
import { applyCvEditDecisions, cvVersionLabel, type EditDecision } from "./cvVersion";
import { detectApplyChannel } from "./applyChannel";
import type { ParsedCv } from "./cvParser";
import type { CvContent } from "./cvTemplate";

const EMPTY_SECTIONS: ParsedCv["sections"] = { summary: null, experiences: [], education: [], languages: [] };

/**
 * Prepare la candidature automatique pour une offre donnee, si ce n'est pas
 * deja fait. Marque l'offre comme "verifiee" (Offer.autoApplyChecked) des
 * qu'il est etabli qu'il n'y a definitivement rien a preparer (pas de CV
 * importe, ou aucun canal de candidature detecte) - pour ne pas retraiter
 * inutilement la meme offre a chaque lot. En cas d'erreur (ex: appel IA
 * qui echoue), l'offre N'EST PAS marquee verifiee : elle sera retentee au
 * prochain lot, l'echec pouvant etre transitoire.
 */
export async function prepareApplicationDraft(offerId: string): Promise<void> {
  const existingDraft = await prisma.applicationDraft.findUnique({ where: { offerId } });
  if (existingDraft) return;

  const [profile, offer] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.offer.findUnique({ where: { id: offerId } }),
  ]);
  if (!offer) return;

  if (!profile?.cvRawText) {
    await prisma.offer.update({ where: { id: offerId }, data: { autoApplyChecked: true } });
    return;
  }

  const channel = detectApplyChannel({ url: offer.url, description: offer.description });
  if (!channel) {
    await prisma.offer.update({ where: { id: offerId }, data: { autoApplyChecked: true } });
    return;
  }

  const cv: ParsedCv = {
    rawText: profile.cvRawText,
    skills: asStringArray(profile.cvSkills),
    sections: asObject(profile.cvSections, EMPTY_SECTIONS),
  };

  const { proposals } = await proposeCvEdits({
    cv,
    currentHeadline: profile.headline,
    offer: { title: offer.title, company: offer.company, description: offer.description },
  });
  // Candidature automatique : on accepte toutes les propositions de l'IA
  // (contrairement au flux manuel de l'editeur de CV, ou l'utilisateur
  // valide chaque proposition une a une) - les garde-fous anti-invention
  // deja en place dans ai.ts/cvVersion.ts restent actifs.
  const decisions: EditDecision[] = proposals.map((p) => ({ id: p.id, action: "accept" }));
  const baseContent: CvContent = {
    headline: profile.headline,
    summary: cv.sections.summary,
    skills: cv.skills,
    experiences: cv.sections.experiences,
    education: cv.sections.education,
    languages: cv.sections.languages,
  };
  const { content } = applyCvEditDecisions(baseContent, profile.headline, proposals, decisions);

  const cvVersion = await prisma.cvVersion.create({
    data: {
      kind: "OFFER_ADAPTED",
      label: cvVersionLabel("OFFER_ADAPTED", offer.company, offer.title),
      offerId: offer.id,
      offerTitle: offer.title,
      offerCompany: offer.company,
      content: toJsonString(content),
    },
  });

  const { text: messageText } = await generateApplicationMessage({
    cv,
    headline: content.headline,
    fullName: profile.fullName,
    offer: { title: offer.title, company: offer.company, description: offer.description },
    matchedSkills: asStringArray(offer.matchedSkills),
  });

  await prisma.applicationDraft.create({
    data: {
      offerId: offer.id,
      cvVersionId: cvVersion.id,
      messageText,
      applyChannel: channel.type,
      applyTarget: channel.target,
      status: "PENDING",
    },
  });

  await prisma.offer.update({ where: { id: offerId }, data: { autoApplyChecked: true } });
}
