// Aurelius — Fanvue v1 Capability Registry
// Generated from the CURRENT Fanvue v1 OpenAPI spec (https://api.fanvue.com/docs/openapi-v1.json).
// This is the single authority for: API version, base URL, scopes, and every
// operation Aurelius may call. No Fanvue path should appear in app code unless
// it is listed here (or is a documented unversioned exception).
//
// 248 operations across 187 paths / 20 categories.

export const FANVUE_API_BASE = "https://api.fanvue.com";
export const FANVUE_AUTH_BASE = "https://auth.fanvue.com";
export const FANVUE_API_VERSION = "2025-06-26";

export const FANVUE_SCOPES = [
  "read:self", "read:chat", "write:chat", "read:experience", "write:experience",
  "read:fan", "read:post", "write:post", "read:media", "write:media",
  "read:creator", "write:creator", "read:insights", "read:tracking_links",
  "write:tracking_links", "read:agency", "write:agency",
] as const;

export type Scope = (typeof FANVUE_SCOPES)[number];

export interface Capability {
  method: string;
  path: string;
  operationId: string;
  scopes: string[];
  category: string;
  scope: "self" | "creator" | "agency"; // who the call acts on
  modifies: boolean;
  money: boolean;
  messaging: boolean;
  media: boolean;
}

const M = (method: string) => ["POST", "PUT", "PATCH", "DELETE"].includes(method);

// (method, path, operationId, scopes) tuples parsed from OpenAPI.
const RAW: [string, string, string, string][] = [
  // Agencies
  ["GET","/v1/agencies/team-members","listTeamMembers","read:agency"],
  ["PUT","/v1/agencies/team-members/{userId}","updateTeamMember","write:agency"],
  ["POST","/v1/agencies/invites","createAgencyInvite","write:agency"],
  ["POST","/v1/agencies/creator-invites","createCreatorInvite","write:agency"],
  ["POST","/v1/agencies/posts","bulkCreateAgencyPosts","write:post,write:creator"],
  ["GET","/v1/agencies/insights/chatter-leaderboard","getChatterLeaderboard","read:agency"],
  ["GET","/v1/agencies/insights/overview","getAgencyInsightsOverview","read:agency,read:creator"],
  ["GET","/v1/agencies/insights/demographics","getAgencyDemographics","read:agency,read:creator"],
  ["GET","/v1/agencies/insights/top-fans","getAgencyTopFans","read:agency,read:creator,read:fan"],
  ["GET","/v1/agencies/chats","listAgencyChatsV1","read:agency,read:chat"],
  ["POST","/v1/agencies/chats/messages/batch","batchAgencyMessages","read:agency,read:chat"],
  ["GET","/v1/agencies/subscribers","listAgencySubscribers_v1_experimental","read:agency,read:creator"],
  ["GET","/v1/agencies/earnings","listAgencyEarningsByDayV1","read:agency,read:creator"],
  ["GET","/v1/agencies/subscribers-history","listAgencySubscribersHistoryV1","read:agency,read:creator"],
  ["GET","/v1/agencies/followers-history","listAgencyFollowersHistoryV1","read:agency,read:creator"],
  // Chats (self-scoped)
  ["POST","/v1/chats","createChat","write:chat"],
  ["GET","/v1/chats","listChats_v1_experimental","read:chat"],
  ["POST","/v1/chats/{userUuid}/message","sendMessage","write:chat"],
  ["POST","/v1/chats/{userUuid}/typing","setTyping","write:chat"],
  ["POST","/v1/chats/mass-messages","sendMassMessage","write:chat,read:fan"],
  ["GET","/v1/chats/mass-messages","listMassMessages_v1_experimental","read:chat"],
  ["DELETE","/v1/chats/mass-messages/{messageUuid}","deleteMassMessage","write:chat"],
  ["PATCH","/v1/chats/mass-messages/{messageUuid}","updateMassMessage","write:chat"],
  ["GET","/v1/chats/{userUuid}/messages/{messageUuid}","getMessage","read:chat"],
  ["DELETE","/v1/chats/{userUuid}/messages/{messageUuid}","deleteMessage","write:chat"],
  ["PATCH","/v1/chats/{userUuid}","updateChat","write:chat"],
  ["GET","/v1/chats/{userUuid}","getChat","read:chat"],
  ["GET","/v1/chats/unread","getUnreadChatsCount","read:chat"],
  ["POST","/v1/chats/statuses","getBatchStatuses","read:chat"],
  ["GET","/v1/chats/{userUuid}/messages","listMessages_v1_experimental","read:chat"],
  ["POST","/v1/chats/messages/batch","messagesBatch","read:chat"],
  ["GET","/v1/chats/{userUuid}/media","listMedia","read:chat"],
  ["GET","/v1/chats/{userUuid}/messages/{messageUuid}/media","getMessageMediaByUuids","read:chat"],
  ["GET","/v1/chats/lists/smart","getSmartLists","read:chat,read:fan"],
  ["GET","/v1/chats/lists/smart/{uuid}","getSmartListMembersV1","read:chat,read:fan"],
  ["GET","/v1/chats/lists/custom","getCustomListsV1","read:chat,read:fan"],
  ["POST","/v1/chats/lists/custom","createCustomList","write:chat"],
  ["GET","/v1/chats/lists/custom/{uuid}","getCustomListMembers_v1_experimental","read:chat,read:fan"],
  ["PATCH","/v1/chats/lists/custom/{uuid}","updateCustomList","write:chat"],
  ["DELETE","/v1/chats/lists/custom/{uuid}","deleteCustomList","write:chat"],
  ["POST","/v1/chats/lists/custom/{uuid}/members","addMembersToCustomList","write:chat"],
  ["DELETE","/v1/chats/lists/custom/{uuid}/members/{userUuid}","removeMemberFromCustomList","write:chat"],
  ["GET","/v1/chats/templates","listTemplateMessagesV1","read:chat"],
  ["POST","/v1/chats/templates","upsertTemplateMessage","write:chat"],
  ["GET","/v1/chats/templates/folders","listTemplateFoldersV1","read:chat"],
  ["POST","/v1/chats/templates/folders","createTemplateFolder","write:chat"],
  ["PATCH","/v1/chats/templates/folders/{folderUuid}","updateTemplateFolder","write:chat"],
  ["GET","/v1/chats/templates/{templateUuid}","getTemplateMessage","read:chat"],
  ["DELETE","/v1/chats/templates/{templateUuid}","deleteTemplateMessage","write:chat"],
  ["GET","/v1/chats/automated-messages","listAutomatedMessages","read:creator"],
  ["PUT","/v1/chats/automated-messages/{trigger}","upsertAutomatedMessage","write:creator"],
  ["DELETE","/v1/chats/automated-messages/{trigger}","deleteAutomatedMessage","write:creator"],
  // Checkout links (self)
  ["GET","/v1/checkout-links","listCheckoutLinks_v1_experimental","read:creator"],
  ["POST","/v1/checkout-links","createCheckoutLink","write:creator"],
  ["PATCH","/v1/checkout-links/{uuid}","updateCheckoutLinkStatus","write:creator"],
  ["DELETE","/v1/checkout-links/{uuid}","deleteCheckoutLink","write:creator"],
  // Collections
  ["GET","/v1/collections","listCollectionsV1","read:post"],
  ["POST","/v1/collections","createCollection","write:post"],
  ["PATCH","/v1/collections/{uuid}","renameCollection","write:post"],
  ["DELETE","/v1/collections/{uuid}","deleteCollection","write:post"],
  // Creators (creator-scoped — 110 ops, agency acts on managed creators)
  ["GET","/v1/creators","listCreatorsV1","read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/followers","listCreatorFollowersV1","read:creator,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/account","getCreatorAccount","read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/subscribers","listCreatorSubscribersV1","read:creator,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/notifications","listCreatorNotifications","read:creator,read:self"],
  ["GET","/v1/creators/{creatorUserUuid}/chats","listCreatorChatsV1","read:creator,read:chat"],
  ["POST","/v1/creators/{creatorUserUuid}/chats","createCreatorChat","write:chat,read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/chats/{userUuid}/message","sendCreatorMessage","write:chat,read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/chats/mass-messages","sendCreatorMassMessage","write:chat,read:creator,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/mass-messages","listCreatorMassMessagesV1","read:creator,read:chat"],
  ["DELETE","/v1/creators/{creatorUserUuid}/chats/mass-messages/{messageUuid}","deleteCreatorMassMessage","write:chat,read:creator"],
  ["PATCH","/v1/creators/{creatorUserUuid}/chats/mass-messages/{messageUuid}","updateCreatorMassMessage","write:chat,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/{userUuid}/messages","listCreatorMessagesV1","read:creator,read:chat"],
  ["PATCH","/v1/creators/{creatorUserUuid}/chats/{userUuid}","updateCreatorChat","write:chat,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/{userUuid}/media","listCreatorChatMedia","read:creator,read:chat"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/{userUuid}/messages/{messageUuid}/media","getCreatorMessageMediaByUuids","read:creator,read:chat"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/unread","getCreatorUnreadChatsCount","read:creator,read:chat"],
  ["POST","/v1/creators/{creatorUserUuid}/chats/statuses","getCreatorBatchStatuses","read:creator,read:chat"],
  ["POST","/v1/creators/{creatorUserUuid}/chats/messages/batch","creatorMessagesBatch","read:creator,read:chat"],
  ["DELETE","/v1/creators/{creatorUserUuid}/chats/{userUuid}/messages/{messageUuid}","deleteCreatorMessage","write:chat,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/media","getCreatorMediaV1","read:creator,read:media"],
  ["GET","/v1/creators/{creatorUserUuid}/media/bulk","getCreatorBulkMedia","read:creator,read:media"],
  ["GET","/v1/creators/{creatorUserUuid}/media/{uuid}","getCreatorMediaByUuid","read:creator,read:media"],
  ["PATCH","/v1/creators/{creatorUserUuid}/media/{uuid}","updateCreatorMedia","write:creator,write:media"],
  ["DELETE","/v1/creators/{creatorUserUuid}/media/{uuid}","deleteCreatorMedia","write:creator,write:media"],
  ["GET","/v1/creators/{creatorUserUuid}/media/links/{uuid}/purchased","getCreatorMediaLinkPurchaseStatus","read:creator,read:media"],
  ["POST","/v1/creators/{creatorUserUuid}/media/{uuid}/grant","grantCreatorMedia","write:creator,write:media"],
  ["GET","/v1/creators/{creatorUserUuid}/media/{uuid}/entitled","getCreatorEntitledMedia","read:creator,read:media"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/earnings","getCreatorEarnings","read:creator,read:insights"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/earnings/summary","getCreatorEarningsSummary","read:creator,read:insights"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/earnings/percentile","getCreatorEarningsPercentile","read:creator,read:insights"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/unsubscribe-reasons","getCreatorUnsubscribeReasons","read:creator,read:insights"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/fan-retention-summary","getCreatorFanRetentionSummary","read:creator,read:insights"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/spending","getCreatorSpending","read:creator,read:insights"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/subscribers","getCreatorSubscribers","read:creator,read:insights"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/top-spenders","getCreatorTopSpendersV1","read:creator,read:insights,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/fans/{userUuid}","getCreatorFanInsights","read:creator,read:insights,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/insights/fans","getCreatorBulkFanInsights","read:creator,read:insights,read:fan"],
  ["POST","/v1/creators/{creatorUserUuid}/insights/fans/batch","batchCreatorFanInsights","read:creator,read:insights,read:fan"],
  ["POST","/v1/creators/{creatorUserUuid}/media/uploads","createCreatorUploadSession","write:creator,write:media"],
  ["GET","/v1/creators/{creatorUserUuid}/media/uploads/{uploadId}/parts/{partNumber}/url","getCreatorUploadPartUrl","write:creator,write:media"],
  ["PATCH","/v1/creators/{creatorUserUuid}/media/uploads/{uploadId}","completeCreatorUploadSession","write:creator,write:media"],
  ["GET","/v1/creators/{creatorUserUuid}/posts","getCreatorPostsV1","read:post,read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/posts","createCreatorPost","write:post,write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/posts/{uuid}","getCreatorPostByUuid","read:post,read:creator"],
  ["PATCH","/v1/creators/{creatorUserUuid}/posts/{uuid}","updateCreatorPost","write:post,write:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/posts/{uuid}","deleteCreatorPost","write:post,write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/posts/{uuid}/tips","getCreatorPostTipsV1","read:post,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/posts/{uuid}/likes","getCreatorPostLikesV1","read:post,read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/posts/{uuid}/repost","repostCreatorPost","write:post,write:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/posts/{uuid}/pin","pinCreatorPost","write:post,write:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/posts/{uuid}/pin","unpinCreatorPost","write:post,write:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/posts/{uuid}/comments","createCreatorPostComment","write:post,write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/posts/{uuid}/comments","getCreatorPostCommentsV1","read:post,read:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/posts/{uuid}/comments/{commentUuid}","deleteCreatorPostComment","write:post,write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/lists/smart","getCreatorSmartLists","read:creator,read:chat,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/lists/smart/{uuid}","getCreatorSmartListMembersV1","read:creator,read:chat,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/lists/custom","getCreatorCustomListsV1","read:creator,read:chat,read:fan"],
  ["POST","/v1/creators/{creatorUserUuid}/chats/lists/custom","createCreatorCustomList","write:chat,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/lists/custom/{uuid}","getCreatorCustomListMembersV1","read:creator,read:chat,read:fan"],
  ["PATCH","/v1/creators/{creatorUserUuid}/chats/lists/custom/{uuid}","updateCreatorCustomList","write:chat,read:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/chats/lists/custom/{uuid}","deleteCreatorCustomList","write:chat,read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/chats/lists/custom/{uuid}/members","addCreatorCustomListMembers","write:chat,read:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/chats/lists/custom/{uuid}/members/{userUuid}","removeCreatorCustomListMember","write:chat,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/checkout-links/payments","listCreatorCheckoutLinkPayments","read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/checkout-links/payments/{invoiceNumber}","getCreatorCheckoutLinkPayment","read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/checkout-links/subscriptions","listCreatorCheckoutLinkSubscriptions","read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/checkout-links/subscriptions/{uuid}/cancel","cancelCreatorCheckoutLinkSubscription","write:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/checkout-links/subscriptions/{uuid}/uncancel","uncancelCreatorCheckoutLinkSubscription","write:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/checkout-links/payments/{invoiceNumber}/refund-requests","requestCreatorCheckoutLinkRefund","write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/checkout-links/refund-requests","listCreatorCheckoutLinkRefundRequests","read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/checkout-links/refund-requests/{uuid}/withdraw","withdrawCreatorCheckoutLinkRefundRequest","write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/checkout-links","listCreatorCheckoutLinksV1","read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/checkout-links","createCreatorCheckoutLink","write:creator"],
  ["PATCH","/v1/creators/{creatorUserUuid}/checkout-links/{uuid}","updateCreatorCheckoutLinkStatus","write:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/checkout-links/{uuid}","deleteCreatorCheckoutLink","write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/tracking-links","listCreatorTrackingLinks","read:tracking_links,read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/tracking-links","createCreatorTrackingLink","write:tracking_links,write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/tracking-links/{uuid}/users","listCreatorTrackingLinkUsers","read:tracking_links,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/tracking-links/{uuid}/users/{userUuid}/metadata","getCreatorUserTrackingMetadata","read:tracking_links,read:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/tracking-links/{uuid}","deleteCreatorTrackingLink","write:tracking_links,write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/subscribers/online","getOnlineSubscribers","read:creator,read:fan"],
  ["POST","/v1/creators/{creatorUserUuid}/vault/folders","createCreatorVaultFolder","write:creator,write:media"],
  ["GET","/v1/creators/{creatorUserUuid}/vault/folders","listCreatorVaultFoldersV1","read:creator,read:media"],
  ["GET","/v1/creators/{creatorUserUuid}/vault/folders/{folderName}","getCreatorVaultFolder","read:creator,read:media"],
  ["PATCH","/v1/creators/{creatorUserUuid}/vault/folders/{folderName}","renameCreatorVaultFolder","write:creator,write:media"],
  ["DELETE","/v1/creators/{creatorUserUuid}/vault/folders/{folderName}","deleteCreatorVaultFolder","write:creator,write:media"],
  ["GET","/v1/creators/{creatorUserUuid}/vault/folders/{folderName}/media","listCreatorVaultFolderMediaV1","read:creator,read:media"],
  ["POST","/v1/creators/{creatorUserUuid}/vault/folders/{folderName}/media","attachCreatorVaultMedia","write:creator,write:media"],
  ["DELETE","/v1/creators/{creatorUserUuid}/vault/folders/{folderName}/media/{mediaUuid}","detachCreatorVaultMedia","write:creator,write:media"],
  ["GET","/v1/creators/{creatorUserUuid}/promotions","listCreatorPromotions","read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/promotions","createCreatorPromotion","write:creator"],
  ["PUT","/v1/creators/{creatorUserUuid}/promotions/{promotionUuid}","updateCreatorPromotion","write:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/promotions/{promotionUuid}","deleteCreatorPromotion","write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/free-trial-links","listCreatorFreeTrialLinks","read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/free-trial-links","createCreatorFreeTrialLink","write:creator"],
  ["PUT","/v1/creators/{creatorUserUuid}/free-trial-links/{uuid}","updateCreatorFreeTrialLink","write:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/free-trial-links/{uuid}","deleteCreatorFreeTrialLink","write:creator"],
  ["PATCH","/v1/creators/{creatorUserUuid}/subscription-price","updateCreatorSubscriptionPrice","write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/automated-messages","listCreatorAutomatedMessages","read:creator"],
  ["PUT","/v1/creators/{creatorUserUuid}/chats/automated-messages/{trigger}","upsertCreatorAutomatedMessage","write:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/chats/automated-messages/{trigger}","deleteCreatorAutomatedMessage","write:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/account-health","getCreatorAccountHealth","read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/account-health/flagged-media","listCreatorFlaggedMediaV1","read:creator"],
  ["POST","/v1/creators/{creatorUserUuid}/blocks/{userUuid}","blockCreatorUser","write:chat,read:creator"],
  ["DELETE","/v1/creators/{creatorUserUuid}/blocks/{userUuid}","unblockCreatorUser","write:chat,read:creator"],
  ["GET","/v1/creators/{creatorUserUuid}/blocks","listCreatorBlockedUsersV1","read:creator,read:chat,read:fan"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/templates","listCreatorTemplateMessages","read:creator,read:chat"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/templates/folders","listCreatorTemplateFolders","read:creator,read:chat"],
  ["GET","/v1/creators/{creatorUserUuid}/chats/templates/{templateUuid}","getCreatorTemplateMessage","read:creator,read:chat"],
  // Experiences
  ["POST","/v1/experiences/token/exchange","exchangeExperienceToken","read:experience"],
  ["POST","/v1/experiences/request-token","mintExperienceRequestToken","write:experience"],
  ["GET","/v1/experiences/{experienceUuid}/actions","listExperienceActions","read:experience"],
  ["GET","/v1/experiences/{experienceUuid}/action-purchases/{purchaseReference}","getExperienceActionPurchase","read:experience"],
  ["GET","/v1/experiences/{experienceUuid}/action-purchases","listExperienceActionPurchases","read:experience"],
  // Followers / subscribers (self)
  ["GET","/v1/followers","listFollowers_v1_experimental","read:fan"],
  ["GET","/v1/subscribers","listSubscribers_v1_experimental","read:fan"],
  ["GET","/v1/subscribers/{userUuid}","getSubscriber","read:fan"],
  // Free-trial links (self)
  ["GET","/v1/free-trial-links","listFreeTrialLinks","read:creator"],
  ["POST","/v1/free-trial-links","createFreeTrialLink","write:creator"],
  ["PUT","/v1/free-trial-links/{uuid}","updateFreeTrialLink","write:creator"],
  ["DELETE","/v1/free-trial-links/{uuid}","deleteFreeTrialLink","write:creator"],
  // Insights (self)
  ["GET","/v1/insights/earnings","getEarnings","read:insights"],
  ["GET","/v1/insights/earnings/summary","getEarningsSummary","read:insights"],
  ["GET","/v1/insights/earnings/percentile","getEarningsPercentile","read:insights"],
  ["GET","/v1/insights/fan-retention-summary","getFanRetentionSummary","read:insights"],
  ["GET","/v1/insights/unsubscribe-reasons","getUnsubscribeReasons","read:insights"],
  ["GET","/v1/insights/spending","getSpending","read:insights"],
  ["GET","/v1/insights/subscribers","getSubscribers","read:insights"],
  ["GET","/v1/insights/top-spenders","listTopSpendersV1","read:insights,read:fan"],
  ["GET","/v1/insights/fans","getBulkFanInsights","read:insights,read:fan"],
  ["POST","/v1/insights/fans/batch","batchFanInsights","read:insights,read:fan"],
  ["POST","/v1/insights/fans/profiles","batchFanProfiles","read:fan"],
  ["GET","/v1/insights/fans/{userUuid}","getFanInsights","read:insights,read:fan"],
  // Media (self)
  ["POST","/v1/media/uploads","createUploadSession","write:media"],
  ["GET","/v1/media/uploads/{uploadId}/parts/{partNumber}/url","getUploadPartUrl","write:media"],
  ["PATCH","/v1/media/uploads/{uploadId}","completeUploadSession","write:media"],
  ["GET","/v1/media","getUserMedia_v1_experimental","read:media"],
  ["GET","/v1/media/bulk","getBulkMedia","read:media"],
  ["GET","/v1/media/{uuid}","getUserMediaByUuid","read:media"],
  ["DELETE","/v1/media/{uuid}","deleteMedia","write:media"],
  ["PATCH","/v1/media/{uuid}","updateMedia","write:media"],
  ["POST","/v1/media/{uuid}/grant","grantMedia","write:media"],
  ["GET","/v1/media/{uuid}/entitled","getEntitledMedia","read:media"],
  ["GET","/v1/media/links/{uuid}/purchased","getMediaLinkPurchaseStatus","read:media"],
  // Media links (self)
  ["GET","/v1/media-links","listMediaLinksV1","read:creator"],
  ["POST","/v1/media-links","createMediaLink","write:creator"],
  ["DELETE","/v1/media-links/{uuid}","deleteMediaLink","write:creator"],
  // Notifications
  ["GET","/v1/notifications","listNotifications","read:self"],
  // Onboarding
  ["POST","/v1/onboarding/creators","onboardCreator","write:creator"],
  // Posts (self)
  ["POST","/v1/posts","createPost","write:post"],
  ["GET","/v1/posts","listPostsV1","read:post"],
  ["GET","/v1/posts/{uuid}","getPostByUuid","read:post"],
  ["PATCH","/v1/posts/{uuid}","updatePost","write:post"],
  ["DELETE","/v1/posts/{uuid}","deletePost","write:post"],
  ["GET","/v1/posts/{uuid}/tips","getPostTips_v1_experimental","read:post"],
  ["GET","/v1/posts/{uuid}/likes","getPostLikes_v1_experimental","read:post"],
  ["GET","/v1/posts/{uuid}/comments","getPostComments_v1_experimental","read:post"],
  ["POST","/v1/posts/{uuid}/comments","createPostComment","write:post"],
  ["POST","/v1/posts/{uuid}/repost","repostPost","write:post"],
  ["POST","/v1/posts/{uuid}/pin","pinPost","write:post"],
  ["DELETE","/v1/posts/{uuid}/pin","unpinPost","write:post"],
  ["DELETE","/v1/posts/{uuid}/comments/{commentUuid}","deletePostComment","write:post"],
  // Promotions (self)
  ["GET","/v1/promotions","listPromotions","read:creator"],
  ["POST","/v1/promotions","createPromotion","write:creator"],
  ["PUT","/v1/promotions/{promotionUuid}","updatePromotion","write:creator"],
  ["DELETE","/v1/promotions/{promotionUuid}","deletePromotion","write:creator"],
  // Tracking links (self)
  ["GET","/v1/tracking-links","listTrackingLinks","read:tracking_links"],
  ["POST","/v1/tracking-links","createTrackingLink","write:tracking_links"],
  ["DELETE","/v1/tracking-links/{uuid}","deleteTrackingLink","write:tracking_links"],
  ["GET","/v1/tracking-links/{uuid}/users","listTrackingLinkUsers","read:tracking_links"],
  ["GET","/v1/tracking-links/{uuid}/users/{userUuid}/metadata","getUserTrackingMetadata","read:tracking_links"],
  // Users / account
  ["GET","/v1/users/me","getCurrentUser","read:self"],
  ["GET","/v1/users/account","getAccount","read:self"],
  ["PATCH","/v1/users/me/subscription-price","updateSubscriptionPrice","write:creator"],
  // Vault (self)
  ["POST","/v1/vault/folders","createVaultFolder","write:media"],
  ["GET","/v1/vault/folders","listVaultFolders_v1_experimental","read:media"],
  ["GET","/v1/vault/folders/{folderName}","getVaultFolder","read:media"],
  ["PATCH","/v1/vault/folders/{folderName}","renameVaultFolder","write:media"],
  ["DELETE","/v1/vault/folders/{folderName}","deleteVaultFolder","write:media"],
  ["GET","/v1/vault/folders/{folderName}/media","listVaultFolderMediaV1","read:media"],
  ["POST","/v1/vault/folders/{folderName}/media","attachMediaToVaultFolder","write:media"],
  ["PATCH","/v1/vault/folders/{folderName}/media/{mediaUuid}","updateVaultFolderMedia","write:media"],
  ["DELETE","/v1/vault/folders/{folderName}/media/{mediaUuid}","detachMediaFromVaultFolder","write:media"],
  // Webhooks
  ["GET","/v1/webhooks/subscriptions","listWebhookSubscriptions","read:self"],
  ["POST","/v1/webhooks/subscriptions","createWebhookSubscription","read:self"],
  ["DELETE","/v1/webhooks/subscriptions/{id}","deleteWebhookSubscription","read:self"],
  ["POST","/v1/webhooks/test","sendTestWebhook","read:self"],
];

function classify(path: string): "self" | "creator" | "agency" {
  if (path.startsWith("/v1/agencies") || path.startsWith("/v1/creators")) {
    if (path.startsWith("/v1/agencies")) return "agency";
    return "creator";
  }
  return "self";
}

function cat(path: string): string {
  return path.split("/")[2] || "root";
}

export const CAPABILITIES: Capability[] = RAW.map(([method, path, operationId, scopesStr]) => {
  const scopes = scopesStr ? scopesStr.split(",") : [];
  const messaging = /chats|message|mass-messages|templates|automated-messages/.test(path);
  const media = /media|vault|collections/.test(path);
  const money = /earnings|spending|payments|refund|checkout|subscription-price|tips|promotions|free-trial/.test(path);
  return {
    method,
    path,
    operationId,
    scopes,
    category: cat(path),
    scope: classify(path),
    modifies: M(method),
    money,
    messaging,
    media,
  };
});

export const CAPABILITY_COUNT = CAPABILITIES.length;

export function findCapability(operationId: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.operationId === operationId);
}

export function capabilitiesByCategory(category: string): Capability[] {
  return CAPABILITIES.filter((c) => c.category === category);
}

export function hasScope(granted: string[] | undefined | null, required: string[]): boolean {
  if (!required.length) return true;
  if (!granted || !granted.length) return false;
  return required.every((s) => granted.includes(s));
}

// Categories with op counts — for the coverage report.
export const CATEGORY_COUNTS: Record<string, number> = CAPABILITIES.reduce(
  (acc, c) => ((acc[c.category] = (acc[c.category] || 0) + 1), acc),
  {} as Record<string, number>
);