import { NextResponse } from 'next/server'

export async function GET() {
  const token = process.env.GH_PAT
  if (!token) {
    return NextResponse.json(
      { error: 'Missing GH_PAT — create a GitHub PAT with Contents: read and set it as a GH_PAT secret' },
      { status: 500, headers: { 'Cache-Control': 'no-cache' } }
    )
  }

  const res = await fetch(
    'https://api.github.com/repos/Alex-Zechariah-02/SWE40006-Project/commits?per_page=20&sha=main',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub API error: ${res.status} — check your GH_PAT has Contents: read on this repo` },
      { status: res.status, headers: { 'Cache-Control': 'no-cache' } }
    )
  }

  return NextResponse.json(await res.json(), {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
}
