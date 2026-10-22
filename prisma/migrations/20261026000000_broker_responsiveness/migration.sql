-- Broker responsiveness and visit fee, from WhatsApp chats and replies (additive).
ALTER TABLE "Broker" ADD COLUMN "visitFee" INTEGER;
ALTER TABLE "Broker" ADD COLUMN "replyMinutes" INTEGER;
ALTER TABLE "Broker" ADD COLUMN "lastReplyAt" TIMESTAMP(3);
