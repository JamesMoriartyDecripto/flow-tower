# Ad policy and brand-safety checklist (policy guard)

Runs on every variant before launch. Any FAIL blocks the variant; a WARN goes to legal review.

## Claims
- [ ] Every number, comparison or compliance statement has a claim id with `status: approved`
      and an `expires` date in the future (`strategy/claims-register.yaml`). FAIL otherwise.
- [ ] Qualifiers from the register are present where the format allows (landing page at minimum).
- [ ] No superlatives without a comparative test ("best", "#1", "fastest"). FAIL.
- [ ] No customer names or logos without a signed reference agreement. FAIL.

## Platform policies (check the live policy centre when in doubt)
- [ ] Google Ads: editorial (no excessive capitalisation, no gimmicky punctuation), destination
      matches the ad, no misleading claims (Misrepresentation policy).
- [ ] Meta: no personal-attribute targeting language ("Are you an overworked accountant?"),
      text/image consistent with the landing page.
- [ ] LinkedIn: lead gen forms collect only fields we use; privacy policy URL set.
- [ ] TikTok: business-appropriate; landing page loads on mobile in < 3 s.

## AI-generated content
- [ ] `ai_generated: true` images and video carry a visible label ("Made with AI") at first
      exposure when they could pass as real (EU AI Act Art. 50(4), applicable from 2 Aug 2026).
- [ ] No realistic synthetic people, voices or testimonials. FAIL.
- [ ] Platform AI-disclosure toggles set where the platform offers them.

## Audiences and data
- [ ] Uploaded lists contain only contacts with marketing consent; hashed (SHA-256) after
      normalisation; EU contacts uploaded only where consent covers ad_user_data.
- [ ] No sensitive categories (health, religion, politics, sexual orientation) in targeting or copy.

## Brand safety
- [ ] Display / video placements: exclusion lists applied (sensitive content, games for kids,
      parked domains); Meta inventory filter "Limited"; LinkedIn Audience Network off for C3.
- [ ] Brand terms: no bidding on competitor trademarks in ad text.

## Spend
- [ ] Campaign created PAUSED with the plan's daily budget; enabling goes through the paid loop guard.
