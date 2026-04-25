import React from 'react'
import { Github } from "@/components/atom/brand-icons";
import Link from 'next/link'

interface GithubButtonProps {
    url: string;
}
const GithubButton = ({ url }: GithubButtonProps) => {
    return (
        <Link
            href={url} 
            className='absolute top-8 right-10 reveal-less'>
            <Github size={30} />
        </Link>
    )
}

export default GithubButton