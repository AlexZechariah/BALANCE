import { NextResponse } from 'next/server'

export const revalidate = 3600

export async function GET() {
  const token = process.env.GH_PAT
  if (!token) {
    return NextResponse.json({ error: 'Missing GH_PAT' }, { status: 500 })
  }

  const res = await fetch(
    'https://api.github.com/repos/Alex-Zechariah-02/SWE40006-Project/releases?per_page=20',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: 3600 },
    }
  )

  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub API error: ${res.status}` },
      { status: res.status }
    )
  }

  return NextResponse.json(await res.json())
}
