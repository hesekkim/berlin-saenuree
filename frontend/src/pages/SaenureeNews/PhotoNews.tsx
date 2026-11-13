import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { IoCopy, IoVideocam } from 'react-icons/io5';
import Button from '../../shared/components/ui/Button/Button';
import LoadingSpinner from '../../shared/components/LoadingSpinner/LoadingSpinner';
import PageHeader from '../../shared/components/PageHeader/PageHeader';
import {
  mediaFileAbsoluteUrl,
  mediaImageAbsoluteUrl,
} from '../../shared/api/mediaApi';
import { fetchPublicPosts } from '../../shared/api/postsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import { getNewsLabels } from './newsLabels';
import { seekVideoToPreviewFrame } from '../../shared/lib/videoPreview';
import MobilePost from './MobilePost';
import PostViewerDialog from './PostViewerDialog';
import styles from './PhotoNews.module.css';

const POSTS_PAGE_SIZE = 30;

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

export default function PhotoNews() {
  const { language, defaultLanguage } = useConfig();
  const labels = getNewsLabels(language);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 760px)').matches
      : false,
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [loadMoreSentinel, setLoadMoreSentinel] =
    useState<HTMLDivElement | null>(null);
  const [isLoadMoreIntersecting, setIsLoadMoreIntersecting] = useState(false);
  const postsQuery = useInfiniteQuery({
    queryKey: ['public-posts'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchPublicPosts({ limit: POSTS_PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.offset + lastPage.limit < lastPage.total
        ? lastPage.offset + lastPage.limit
        : undefined,
  });
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = postsQuery;
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia('(max-width: 760px)');
    const updateIsMobile = () => setIsMobile(media.matches);
    updateIsMobile();
    media.addEventListener('change', updateIsMobile);
    return () => media.removeEventListener('change', updateIsMobile);
  }, []);

  useEffect(() => {
    if (!loadMoreSentinel || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsLoadMoreIntersecting(entry.isIntersecting),
      { rootMargin: '400px' },
    );
    observer.observe(loadMoreSentinel);
    return () => observer.disconnect();
  }, [loadMoreSentinel, posts.length]);

  useEffect(() => {
    if (
      !isLoadMoreIntersecting ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError
    ) {
      return;
    }

    void fetchNextPage();
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetchingNextPage,
    isLoadMoreIntersecting,
  ]);

  const selectedPostIndex = posts.findIndex(
    (post) => post.id === selectedPostId,
  );
  const selectedPost =
    selectedPostIndex >= 0 ? posts[selectedPostIndex] : null;
  const selectAdjacentPost = async (offset: -1 | 1) => {
    const adjacentPost = posts[selectedPostIndex + offset];
    if (adjacentPost) {
      setSelectedPostId(adjacentPost.id);
      return;
    }
    if (
      offset !== 1 ||
      !hasNextPage ||
      isFetchingNextPage ||
      selectedPostIndex < 0
    ) {
      return;
    }

    const result = await fetchNextPage();
    const loadedPosts = result.data?.pages.flatMap((page) => page.items) ?? [];
    const nextPost = loadedPosts[selectedPostIndex + 1];
    if (nextPost) {
      setSelectedPostId(nextPost.id);
    }
  };

  return (
    <main className={styles.page}>
      <PageHeader className={styles.header} title={labels.photoNewsTitle} />

      {postsQuery.isPending ? (
        <LoadingSpinner text={labels.loading} />
      ) : postsQuery.isError && posts.length === 0 ? (
        <div className={styles.message} role="alert">
          <p>{labels.loadFailed}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void postsQuery.refetch()}
          >
            {labels.retry}
          </Button>
        </div>
      ) : posts.length === 0 ? (
        <p className={styles.emptyState}>{labels.postsEmpty}</p>
      ) : (
        <>
          {isMobile ? (
            <section className={styles.mobileFeed} aria-label={labels.photoNews}>
              {posts.map((post) => (
                <MobilePost
                  key={post.id}
                  post={post}
                  language={language}
                  defaultLanguage={defaultLanguage}
                  labels={labels}
                />
              ))}
            </section>
          ) : (
            <section className={styles.postGrid} aria-label={labels.photoNews}>
              {posts.map((post) => {
                const cover = post.media[0];
                return (
                  <button
                    type="button"
                    key={post.id}
                    className={styles.gridItem}
                    aria-label={formatDate(post.createdAt, language)}
                    onClick={() => setSelectedPostId(post.id)}
                  >
                    {cover?.type === 'image' ? (
                      <img
                        className={styles.gridPhoto}
                        src={mediaImageAbsoluteUrl(cover.imageId, 'thumb')}
                        alt=""
                        loading="lazy"
                        width={cover.width}
                        height={cover.height}
                      />
                    ) : cover?.type === 'video' ? (
                      <video
                        className={styles.gridPhoto}
                        src={mediaFileAbsoluteUrl(
                          `/api/v1/media/files/${cover.fileId}`,
                        )}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) =>
                          seekVideoToPreviewFrame(event.currentTarget)
                        }
                      />
                    ) : null}
                    {post.media.some((item) => item.type === 'video') ? (
                      <span
                        className={styles.videoIndicator}
                        aria-hidden="true"
                      >
                        <IoVideocam className={styles.videoIcon} />
                      </span>
                    ) : post.media.length > 1 ? (
                      <IoCopy className={styles.multiImageIcon} aria-hidden />
                    ) : null}
                  </button>
                );
              })}
            </section>
          )}

          {!isMobile && selectedPost ? (
            <PostViewerDialog
              key={selectedPost.id}
              post={selectedPost}
              postIndex={selectedPostIndex}
              postCount={posts.length}
              hasNextPage={Boolean(hasNextPage)}
              isNextPostLoading={isFetchingNextPage}
              language={language}
              defaultLanguage={defaultLanguage}
              labels={labels}
              onClose={() => setSelectedPostId(null)}
              onPreviousPost={() => selectAdjacentPost(-1)}
              onNextPost={() => selectAdjacentPost(1)}
            />
          ) : null}

          {hasNextPage ? (
            <div ref={setLoadMoreSentinel} className={styles.loadMore}>
              {isFetchNextPageError ? (
                <div className={styles.message} role="alert">
                  <p>{labels.loadMoreFailed}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void fetchNextPage()}
                  >
                    {labels.retry}
                  </Button>
                </div>
              ) : isFetchingNextPage ? (
                <LoadingSpinner text={labels.loading} />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
