import { config } from "dotenv";
// override:true + the deferred db import below ensure DATABASE_URL is loaded
// before @/lib/db builds its adapter (otherwise the client falls back to the
// libpq default DB → P1003 DatabaseDoesNotExist).
config({ override: true });

// Seeds host⇄guest message threads off existing bookings so each demo host
// (0001…0020) has a populated inbox.

const HOST_COUNT = 20;
const PER_HOST = 12;

type Turn = { role: "guest" | "host"; body: string };

// Bilingual thread templates (Arabic-first, matching the live reference). The
// last turn varies so some threads land unread on the host side.
const THREADS: Turn[][] = [
  [
    { role: "guest", body: "السلام عليكم، هل العقار متاح في هذه التواريخ؟" },
    { role: "host", body: "وعليكم السلام، نعم متاح وبانتظار استضافتكم 😊" },
    { role: "guest", body: "ممتاز، شكراً لك!" },
  ],
  [
    { role: "guest", body: "مرحباً، هل يوجد موقف سيارات خاص؟" },
    { role: "host", body: "نعم، يوجد موقف خاص مجاني أمام المبنى." },
  ],
  [
    { role: "guest", body: "هل تتوفر واي فاي وتكييف في جميع الغرف؟" },
    { role: "host", body: "بالتأكيد، الإنترنت سريع والتكييف في كل الغرف." },
    { role: "guest", body: "تمام، سنحجز الآن. شكراً جزيلاً." },
  ],
  [
    { role: "guest", body: "Hi! Would an early check-in be possible?" },
    { role: "host", body: "Hi! Yes, you can check in from 1 PM. See you soon!" },
  ],
  [
    { role: "guest", body: "Hello, how far is the place from the Red Sea corniche?" },
    { role: "host", body: "It's about a 5-minute walk to the corniche." },
    { role: "guest", body: "Perfect, thanks for the quick reply!" },
  ],
  [
    { role: "guest", body: "شكراً لقبول الحجز! نتطلع للإقامة." },
    { role: "host", body: "العفو، أهلاً وسهلاً بكم. أخبروني إن احتجتم أي شيء." },
  ],
  [
    { role: "guest", body: "Is the kitchen fully equipped for cooking?" },
    { role: "host", body: "Yes — stove, fridge, microwave and basic utensils are all there." },
  ],
];

async function main() {
  const { db: prisma } = await import("@/lib/db");

  const hostEmails = Array.from({ length: HOST_COUNT }, (_, i) => `${String(i + 1).padStart(4, "0")}@mkan.org`);
  const hosts = await prisma.user.findMany({
    where: { email: { in: hostEmails } },
    select: { id: true, email: true },
  });

  if (hosts.length === 0) {
    console.log("No demo hosts (0001…0020@mkan.org) found — run `pnpm seed:listings` first.");
    return;
  }

  // Guest pool for hosts that have listings but no bookings (e.g. the heirs
  // host 0001) so every inbox has at least one welcome thread to demo.
  const guests = await prisma.user.findMany({
    where: { role: "USER" },
    select: { id: true },
    take: 10,
  });

  let convoCount = 0;
  let msgCount = 0;

  for (const host of hosts) {
    const bookings = await prisma.booking.findMany({
      where: { listing: { hostId: host.id } },
      select: { id: true, guestId: true, listingId: true, createdAt: true, checkIn: true },
      orderBy: { createdAt: "desc" },
      take: PER_HOST,
    });

    for (const b of bookings) {
      if (b.guestId === host.id) continue;

      const convo = await prisma.conversation.upsert({
        where: { bookingId: b.id },
        update: {},
        create: { hostId: host.id, guestId: b.guestId, listingId: b.listingId, bookingId: b.id },
        select: { id: true },
      });

      const existing = await prisma.message.count({ where: { conversationId: convo.id } });
      if (existing > 0) continue;

      const thread = THREADS[b.id % THREADS.length];
      // anchor the thread a couple of days before booking creation
      const base = new Date(b.createdAt.getTime() - 2 * 24 * 60 * 60 * 1000);
      let last = base;
      for (let i = 0; i < thread.length; i++) {
        const turn = thread[i];
        const at = new Date(base.getTime() + i * 37 * 60 * 1000); // ~37 min apart
        await prisma.message.create({
          data: {
            conversationId: convo.id,
            senderId: turn.role === "host" ? host.id : b.guestId,
            body: turn.body,
            createdAt: at,
          },
        });
        last = at;
        msgCount++;
      }

      const lastSenderIsGuest = thread[thread.length - 1].role === "guest";
      await prisma.conversation.update({
        where: { id: convo.id },
        data: {
          lastMessageAt: last,
          // unread on the host side when the guest spoke last
          hostReadAt: lastSenderIsGuest ? null : last,
          guestReadAt: lastSenderIsGuest ? last : null,
        },
      });
      convoCount++;
    }

    // Fallback: a host with listings but no bookings still gets one welcome
    // thread so its inbox isn't empty in the demo.
    const hostConvos = await prisma.conversation.count({ where: { hostId: host.id } });
    if (hostConvos === 0) {
      const guest = guests.find((g) => g.id !== host.id);
      const listing = await prisma.listing.findFirst({
        where: { hostId: host.id },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (guest && listing) {
        const convo = await prisma.conversation.create({
          data: { hostId: host.id, guestId: guest.id, listingId: listing.id },
          select: { id: true },
        });
        const thread = THREADS[0];
        const base = new Date(Date.now() - 36 * 60 * 60 * 1000);
        let last = base;
        for (let i = 0; i < thread.length; i++) {
          const at = new Date(base.getTime() + i * 41 * 60 * 1000);
          await prisma.message.create({
            data: {
              conversationId: convo.id,
              senderId: thread[i].role === "host" ? host.id : guest.id,
              body: thread[i].body,
              createdAt: at,
            },
          });
          last = at;
          msgCount++;
        }
        await prisma.conversation.update({
          where: { id: convo.id },
          data: { lastMessageAt: last, hostReadAt: null, guestReadAt: last },
        });
        convoCount++;
      }
    }
  }

  console.log(`Seeded ${convoCount} conversations and ${msgCount} messages across ${hosts.length} hosts.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
