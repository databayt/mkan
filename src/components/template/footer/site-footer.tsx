/** @format */

"use client";

import Link from "next/link";
import { Globe, Facebook, Twitter, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportIssue } from "@/components/report-issue";
import { usePathname } from "next/navigation";

export default function SiteFooter() {
	const pathname = usePathname();
	const isAr = pathname?.startsWith("/ar");

	return (
		<div className='bg-muted border-t border-border'>
			<div className='max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12'>
				{/* Main footer content */}
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8 justify-items-center'>
					{/* Support Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{isAr ? "الدعم" : "Support"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "مركز المساعدة" : "Help Center"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "معلومات السلامة" : "Safety information"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "خيارات الإلغاء" : "Cancellation options"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "دعم ذوي الاحتياجات الخاصة" : "Supporting people with disabilities"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "الإبلاغ عن مشكلة" : "Report a concern"}
								</Link>
							</li>
						</ul>
					</div>

					{/* Community Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{isAr ? "المجتمع" : "Community"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "الإسكان الإغاثي" : "Disaster relief housing"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "الاحتفاء بالتنوع والانتماء" : "Celebrating diversity & belonging"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "مكافحة التمييز" : "Combating discrimination"}
								</Link>
							</li>
						</ul>
					</div>

					{/* Hosting Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{isAr ? "الاستضافة" : "Hosting"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "جرّب الاستضافة" : "Try hosting"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "استكشف موارد الاستضافة" : "Explore hosting resources"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "زر منتدى المجتمع" : "Visit our community forum"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "كيف تستضيف بمسؤولية" : "How to host responsibly"}
								</Link>
							</li>
						</ul>
					</div>

					{/* About Column */}
					<div className='text-start'>
						<h3 className='font-semibold text-sm mb-4'>
							{isAr ? "حول" : "About"}
						</h3>
						<ul className='space-y-3'>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "غرفة الأخبار" : "Newsroom"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "تعرّف على الميزات الجديدة" : "Learn about new features"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "وظائف" : "Careers"}
								</Link>
							</li>
							<li>
								<Link
									href='#'
									className='text-muted-foreground text-sm font-light hover:underline'>
									{isAr ? "المستثمرون" : "Investors"}
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
							<p>{isAr ? "\u00A9 2024 مكان" : "\u00A9 2024 Mkan"}</p>
							<span>·</span>
							<Link href='#' className='hover:underline'>
								{isAr ? "الخصوصية" : "Privacy"}
							</Link>
							<span>·</span>
							<Link href='#' className='hover:underline'>
								{isAr ? "الشروط" : "Terms"}
							</Link>
							<span>·</span>
							<Link href='#' className='hover:underline'>
								{isAr ? "خريطة الموقع" : "Sitemap"}
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
								{isAr ? "العربية" : "English"}
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
