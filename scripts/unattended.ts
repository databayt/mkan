/**
 * The line an unattended run never crosses. The sprint runner (scripts/crm/hermes/sprint-runner.sh)
 * sets MKAN_UNATTENDED=1 for the Claude Code session it starts: that session may read, fix, build
 * and deploy, but anything that reaches a real person outside Databayt — a broker, a tenant, a host,
 * the public TikTok page — or re-pairs the WhatsApp line stops here, and the runner marks the prompt
 * "needs you" so Abdout does that step himself.
 */
export function refuseUnattended(what: string): void {
  if (process.env.MKAN_UNATTENDED !== '1') return;
  console.error(`✋ Refused in an unattended run: ${what}. Leave this step for Abdout — report it with \`pnpm sprint:done <id> --blocked --result="…"\`.`);
  process.exit(3);
}
