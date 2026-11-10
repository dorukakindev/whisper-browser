# Recommendation feature attribution

Weighted sparse feature cosine in src/personal-recommendations.js is adapted from SauwenBlush/seanime-taste-engine/src/index.ts, tree 1c0db322bf06cd2734ff5068af544b73d537ac5e. https://github.com/SauwenBlush/seanime-taste-engine/blob/1c0db322bf06cd2734ff5068af544b73d537ac5e/src/index.ts . MIT notice is retained in seanime-taste-engine-LICENSE.txt.

Whisper-specific behavior is independently implemented: ratings-only positive/negative evidence; seven isolated media pools; support/counter-evidence; planned-title exclusion policy; bounded candidate cache; no completion-as-like rule. Strong non-spoiler theme filtering and profile/metadata presentation were informed by What-Next and the reviewed provider implementations; no other third-party source is copied into runtime in this change. Details and source identities are in docs/research/2026-11-10-recommendation-repositories.md.
