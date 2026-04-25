/** @format */

"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { Facebook, Twitter, Instagram } from "@/components/atom/brand-icons";
import { Button } from "@/components/ui/button";
import { ReportIssue } from "@/components/report-issue";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function SiteFooter() {
	const dict = useDictionary();

	return (
		<div className='bg-muted border-t border-border'>
			<div className='max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12'>
				{/* Main footer content */}
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8 justify-items-center'>
					{/* Support Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{dict.siteFooter?.support ?? "Support"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.helpCenter ?? "Help Center"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.safetyInfo ?? "Safety information"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.cancellationOptions ?? "Cancellation options"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.disabilitySupport ?? "Supporting people with disabilities"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.reportConcern ?? "Report a concern"}
								</Link>
							</li>
						</ul>
					</div>

					{/* Community Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{dict.siteFooter?.community ?? "Community"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.disasterRelief ?? "Disaster relief housing"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.diversityBelonging ?? "Celebrating diversity & belonging"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.combatDiscrimination ?? "Combating discrimination"}
								</Link>
							</li>
						</ul>
					</div>

					{/* Hosting Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{dict.siteFooter?.hosting ?? "Hosting"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.tryHosting ?? "Try hosting"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.hostingResources ?? "Explore hosting resources"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.communityForum ?? "Visit our community forum"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.hostResponsibly ?? "How to host responsibly"}
								</Link>
							</li>
						</ul>
					</div>

					{/* About Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{dict.siteFooter?.about ?? "About"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.newsroom ?? "Newsroom"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.newFeatures ?? "Learn about new features"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.careers ?? "Careers"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{dict.siteFooter?.investors ?? "Investors"}
								</Link>
							</li>
						</ul>
					</div>
				</div>

				{/* Bottom section */}
				<div className='border-t border-border pt-4 sm:pt-6 px-2 sm:px-6'>
					<div className='flex flex-col gap-4 sm:gap-6 lg:flex-row justify-between items-start lg:items-center'>
						{/* Left side - Copyright and legal links */}
						<div className='flex flex-wrap items-center gap-4 text-sm text-muted-foreground'>
							<p>{dict.siteFooter?.copyright ?? "\u00A9 2024 Mkan"}</p>
							<span>·</span>
							<Link href='#' className='hover:underline'>
								{dict.siteFooter?.privacy ?? "Privacy"}
							</Link>
							<span>·</span>
							<Link href='#' className='hover:underline'>
								{dict.siteFooter?.terms ?? "Terms"}
							</Link>
							<span>·</span>
							<Link href='#' className='hover:underline'>
								{dict.siteFooter?.sitemap ?? "Sitemap"}
							</Link>
							<span>·</span>
							<ReportIssue />
						</div>

						{/* Right side - Language and social icons */}
						<div className='flex items-center gap-4'>
							<Button
								variant='ghost'
								size='sm'
								className='text-muted-foreground hover:bg-background gap-2'>
								<Globe className='w-4 h-4' />
								{dict.siteFooter?.language ?? "English"}
							</Button>
							<div className='flex items-center gap-2'>
								<Button
									variant='ghost'
									size='icon'
									className='w-8 h-8 text-muted-foreground hover:bg-background'>
									<Facebook className='w-4 h-4' />
									<span className='sr-only'>Facebook</span>
								</Button>
								<Button
									variant='ghost'
									size='icon'
									className='w-8 h-8 text-muted-foreground hover:bg-background'>
									<Twitter className='w-4 h-4' />
									<span className='sr-only'>Twitter</span>
								</Button>
								<Button
									variant='ghost'
									size='icon'
									className='w-8 h-8 text-muted-foreground hover:bg-background'>
									<Instagram className='w-4 h-4' />
									<span className='sr-only'>Instagram</span>
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
