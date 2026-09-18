import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config/env';
import type { PostService } from '../services/post-service';
import type { Post } from '../types/post';

export function usePost(service: PostService) {
  const [post, setPost] = useState<Post | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (label: string, operation: () => Promise<Post>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError(null);
    try {
      const result = await operation();
      if (mounted.current) setPost(result);
      return result;
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(null);
    }
  }, []);

  // Polling sequencial; pausa ao falhar, sem repetir comandos de escrita.
  useEffect(() => {
    if (!post || busy || error || !['generating', 'publishing', 'scheduled'].includes(post.status))
      return;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const result = await service.getPost(post.id);
          if (!cancelled) setPost(result);
        } catch (e) {
          if (!cancelled)
            setError(e instanceof Error ? e.message : 'Não foi possível atualizar o status.');
        }
      },
      post.status === 'scheduled' ? Math.max(15000, config.pollIntervalMs) : config.pollIntervalMs,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [post, busy, error, service]);

  const working = Boolean(busy || post?.status === 'generating' || post?.status === 'publishing');
  return {
    post,
    busy,
    error,
    working,
    run,
    refresh: () => post && run('Atualizando status', () => service.getPost(post.id)),
  };
}
