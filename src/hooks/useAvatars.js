import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { showToast } from '../components/Toast'

export function useAvatars() {
  const [avatars, setAvatars] = useState({})

  useEffect(() => { loadAvatars() }, [])

  async function loadAvatars() {
    const { data: files, error } = await db.storage.from('poker-photos').list('avatars')
    if (error || !files) return
    const newAvatars = {}
    files.forEach(file => {
      const name = decodeURIComponent(file.name.replace(/\.[^.]+$/, ''))
      const { data } = db.storage.from('poker-photos').getPublicUrl('avatars/' + file.name)
      if (data?.publicUrl) newAvatars[name] = data.publicUrl + '?t=' + file.updated_at
    })
    setAvatars(newAvatars)
  }

  async function uploadAvatar(name, file) {
    if (file.size > 5 * 1024 * 1024) { showToast('⚠ Bild zu groß (max 5 MB)'); return }
    showToast('👤 Foto wird hochgeladen…')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `avatars/${encodeURIComponent(name)}.${ext}`
    const { error } = await db.storage.from('poker-photos').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { showToast('⚠ Upload fehlgeschlagen: ' + error.message); return }
    const { data } = db.storage.from('poker-photos').getPublicUrl(path)
    setAvatars(prev => ({ ...prev, [name]: data.publicUrl + '?t=' + Date.now() }))
    showToast('✓ Profilbild gespeichert!')
  }

  async function deleteAvatar(name) {
    const { data: files } = await db.storage.from('poker-photos').list('avatars')
    const match = (files || []).find(f => decodeURIComponent(f.name.replace(/\.[^.]+$/, '')) === name)
    if (!match) { showToast('⚠ Foto nicht gefunden'); return }
    const { error } = await db.storage.from('poker-photos').remove([`avatars/${match.name}`])
    if (error) { showToast('⚠ Löschen fehlgeschlagen'); return }
    setAvatars(prev => { const n = { ...prev }; delete n[name]; return n })
    showToast('✓ Foto gelöscht')
  }

  return { avatars, uploadAvatar, deleteAvatar }
}
