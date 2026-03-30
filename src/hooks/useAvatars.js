import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { safeName } from '../components/Avatar'

export function useAvatars() {
  const [avatars, setAvatars] = useState({})

  useEffect(() => { loadAvatars() }, [])

  async function loadAvatars() {
    const { data: files, error } = await db.storage.from('poker-photos').list('avatars')
    if (error || !files) return
    const newAvatars = {}
    files.forEach(file => {
      const fileKey = file.name.replace(/\.[^.]+$/, '') // e.g. "David" or "Matdodel"
      const { data } = db.storage.from('poker-photos').getPublicUrl('avatars/' + file.name)
      if (data?.publicUrl) {
        const url = data.publicUrl + '?t=' + (file.updated_at || Date.now())
        // Store under the file key (safeName)
        newAvatars[fileKey] = url
      }
    })
    setAvatars(newAvatars)
  }

  async function uploadAvatar(name, file) {
    if (file.size > 5 * 1024 * 1024) { showToast('⚠ Bild zu groß (max 5 MB)'); return }
    showToast('👤 Foto wird hochgeladen…')

    const safe = safeName(name)

    // Delete all existing files for this player
    const { data: existing } = await db.storage.from('poker-photos').list('avatars')
    const toDelete = (existing || [])
      .filter(f => f.name.replace(/\.[^.]+$/, '') === safe)
      .map(f => `avatars/${f.name}`)
    if (toDelete.length > 0) await db.storage.from('poker-photos').remove(toDelete)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `avatars/${safe}.${ext}`
    const { error } = await db.storage.from('poker-photos').upload(path, file, {
      upsert: true, contentType: file.type,
    })
    if (error) { showToast('⚠ Upload fehlgeschlagen: ' + error.message); return }

    const { data } = db.storage.from('poker-photos').getPublicUrl(path)
    setAvatars(prev => ({ ...prev, [safe]: data.publicUrl + '?t=' + Date.now() }))
    showToast('✓ Profilbild gespeichert!')
  }

  async function deleteAvatar(name) {
    const safe = safeName(name)
    const { data: files } = await db.storage.from('poker-photos').list('avatars')
    const toDelete = (files || [])
      .filter(f => f.name.replace(/\.[^.]+$/, '') === safe)
      .map(f => `avatars/${f.name}`)
    if (toDelete.length === 0) { showToast('⚠ Foto nicht gefunden'); return }
    const { error } = await db.storage.from('poker-photos').remove(toDelete)
    if (error) { showToast('⚠ Löschen fehlgeschlagen'); return }
    setAvatars(prev => { const n = { ...prev }; delete n[safe]; return n })
    showToast('✓ Foto gelöscht')
  }

  return { avatars, uploadAvatar, deleteAvatar }
}
