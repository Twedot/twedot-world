import { useState, useRef, useEffect, useCallback } from 'react'
import type { TwedotBusiness } from '../api/twedotApi'
import { searchBusinessesByQuery } from '../api/twedotApi'
import type { BuildingDef } from '../world/types'
import './CitySearch.css'

interface Props {
  businesses: TwedotBusiness[]
  defs: BuildingDef[]
  onSelect: (def: BuildingDef) => void
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️', services: '🏢', retail: '🛍️', stores: '🛍️', sales: '🏷️',
  entertainment: '🎭', health: '🏥', education: '🎓', other: '🏢',
}

interface Result { biz: TwedotBusiness; matchedProduct?: boolean }

export default function CitySearch({ businesses, defs, onSelect }: Props) {
  const [query, setQuery]         = useState('')
  const [open, setOpen]           = useState(false)
  const [idx, setIdx]             = useState(-1)
  const [results, setResults]     = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)
  const rootRef                   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIdx(-1)
    const q = query.trim()
    if (q.length < 1) { setResults([]); setSearching(false); return }

    // Instant client-side match on name / category / description
    const lq = q.toLowerCase()
    const local = businesses.filter(b =>
      b.name.toLowerCase().includes(lq) ||
      b.category.toLowerCase().includes(lq) ||
      (b.description ?? '').toLowerCase().includes(lq)
    )
    const localIds = new Set(local.map(b => b.id))
    setResults(local.slice(0, 8).map(b => ({ biz: b })))
    // Show "Searching…" only when local has nothing (server may still find via items)
    setSearching(local.length === 0)

    // Debounced server call searches items too
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const serverBizs = await searchBusinessesByQuery(q, 20)
        // Keep client-side results first; append any new server-only matches after
        setResults(prev => {
          const prevIds = new Set(prev.map(r => r.biz.id))
          const extra: Result[] = serverBizs
            .filter(b => !prevIds.has(b.id))
            .map(b => ({ biz: b, matchedProduct: !localIds.has(b.id) }))
          return [...prev, ...extra].slice(0, 10)
        })
      } finally {
        setSearching(false)
      }
    }, 380)
  }, [query, businesses])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const pick = useCallback((biz: TwedotBusiness) => {
    const def = defs.find(d => d.businessId === biz.id)
    if (!def) return
    setQuery('')
    setOpen(false)
    setResults([])
    onSelect(def)
  }, [defs, onSelect])

  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && idx >= 0) pick(results[idx].biz)
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  return (
    <div className="cs-root" ref={rootRef}>
      <div className="cs-bar">
        <svg className="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
        <input
          ref={inputRef}
          className="cs-input"
          placeholder="Search businesses, services…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {query && (
          <button className="cs-clear" onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus() }}>×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="cs-dropdown">
          {results.map(({ biz, matchedProduct }, i) => (
            <div
              key={biz.id}
              className={`cs-item${i === idx ? ' cs-item-active' : ''}`}
              onMouseDown={() => pick(biz)}
              onMouseEnter={() => setIdx(i)}
            >
              <div className="cs-item-icon">
                {biz.logo_url
                  ? <img src={biz.logo_url} alt="" className="cs-item-logo" />
                  : <span>{CATEGORY_EMOJI[biz.category] ?? '🏢'}</span>
                }
              </div>
              <div className="cs-item-body">
                <div className="cs-item-name">{biz.name}</div>
                <div className="cs-item-meta">
                  <span className="cs-item-cat">{biz.category}</span>
                  {matchedProduct
                    ? <span className="cs-item-product-match">has matching product</span>
                    : biz.description && (
                      <span className="cs-item-desc">
                        {biz.description.length > 60 ? biz.description.slice(0, 60) + '…' : biz.description}
                      </span>
                    )
                  }
                </div>
              </div>
              <div className="cs-item-arrow">›</div>
            </div>
          ))}
        </div>
      )}

      {open && query.trim().length >= 1 && results.length === 0 && (
        <div className="cs-dropdown cs-empty">
          {searching
            ? <span className="cs-searching">Searching…</span>
            : <span>No businesses found for "<strong>{query}</strong>"</span>
          }
        </div>
      )}
    </div>
  )
}
