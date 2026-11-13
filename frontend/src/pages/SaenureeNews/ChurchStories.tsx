import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Button from '../../shared/components/ui/Button/Button';
import LoadingSpinner from '../../shared/components/LoadingSpinner/LoadingSpinner';
import PageHeader from '../../shared/components/PageHeader/PageHeader';
import SanitizedRichText from '../../shared/components/ui/SanitizedRichText/SanitizedRichText';
import {
  fetchPublicBlogger,
  fetchPublicBloggerItem,
} from '../../shared/api/bloggerApi';
import { useConfig } from '../../shared/context/ConfigContext';
import { richHtmlPlainText } from '../../shared/lib/richText';
import { resolveBloggerCopy } from '../../shared/content/resolveBloggerCopy';
import { getNewsLabels } from './newsLabels';
import styles from './ChurchStories.module.css';

const STORIES_PAGE_SIZE = 10;
const STORY_EXCERPT_LENGTH = 240;

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(
    new Date(value),
  );
}

export default function ChurchStories() {
  const { id } = useParams();
  const { language, defaultLanguage } = useConfig();
  const labels = getNewsLabels(language);
  const [page, setPage] = useState(1);
  const storiesQuery = useQuery({
    queryKey: ['public-blogger', page],
    queryFn: () =>
      fetchPublicBlogger({
        limit: STORIES_PAGE_SIZE,
        offset: (page - 1) * STORIES_PAGE_SIZE,
      }),
    enabled: !id,
  });
  const storyQuery = useQuery({
    queryKey: ['public-blogger', id],
    queryFn: () => fetchPublicBloggerItem(id!),
    enabled: Boolean(id),
    retry: false,
  });
  const stories = storiesQuery.data?.items ?? [];
  const pageCount = Math.ceil(
    (storiesQuery.data?.total ?? 0) / STORIES_PAGE_SIZE,
  );
  const story = storyQuery.data;
  const storyNotFound =
    axios.isAxiosError(storyQuery.error) &&
    storyQuery.error.response?.status === 404;
  const storyCopy = story
    ? resolveBloggerCopy(story.copies, language, defaultLanguage)
    : null;

  return (
    <main className={styles.page}>
      {!id ? (
        <PageHeader className={styles.header} title={labels.storiesPageTitle} />
      ) : null}

      {id ? (
        storyQuery.isPending ? (
          <LoadingSpinner text={labels.loading} />
        ) : storyQuery.isError || !story ? (
          <div className={styles.message} role="alert">
            <p>{storyNotFound ? labels.storyNotFound : labels.loadFailed}</p>
            {!storyNotFound ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void storyQuery.refetch()}
              >
                {labels.retry}
              </Button>
            ) : null}
          </div>
        ) : (
          <article className={styles.story}>
            <div className={styles.storyMeta}>
              <Link className={styles.backLink} to="/saenuree-news/blogger">
                {labels.backToStories}
              </Link>
              <time className={styles.date} dateTime={story.createdAt}>
                {formatDate(story.createdAt, language)}
              </time>
            </div>
            <h2 className={styles.storyTitle}>{storyCopy?.title}</h2>
            <SanitizedRichText
              html={storyCopy?.body ?? ''}
              className={styles.storyBody}
            />
          </article>
        )
      ) : storiesQuery.isPending ? (
        <LoadingSpinner text={labels.loading} />
      ) : storiesQuery.isError && stories.length === 0 ? (
        <div className={styles.message} role="alert">
          <p>{labels.loadFailed}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void storiesQuery.refetch()}
          >
            {labels.retry}
          </Button>
        </div>
      ) : stories.length === 0 ? (
        <p className={styles.message}>{labels.storiesEmpty}</p>
      ) : (
        <>
          <section className={styles.storyList} aria-label={labels.churchStories}>
            {stories.map((item) => {
              const copy = resolveBloggerCopy(
                item.copies,
                language,
                defaultLanguage,
              );
              const excerpt = richHtmlPlainText(copy.body);
              return (
                <article className={styles.storyPreview} key={item.id}>
                  <Link
                    className={styles.storyPreviewLink}
                    to={`/saenuree-news/blogger/${item.id}`}
                  >
                    <time className={styles.date} dateTime={item.createdAt}>
                      {formatDate(item.createdAt, language)}
                    </time>
                    <h2 className={styles.previewTitle}>
                      {copy.title}
                    </h2>
                    {excerpt ? (
                      <p className={styles.excerpt}>
                        {excerpt.length > STORY_EXCERPT_LENGTH
                          ? `${excerpt.slice(0, STORY_EXCERPT_LENGTH).trim()}…`
                          : excerpt}
                      </p>
                    ) : null}
                  </Link>
                </article>
              );
            })}
          </section>
          {storiesQuery.isError ? (
            <p className={styles.message} role="alert">
              {labels.loadFailed}
            </p>
          ) : null}
          {pageCount > 1 ? (
            <nav
              className={styles.pagination}
              aria-label={labels.storiesPagination}
            >
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1 || storiesQuery.isFetching}
              >
                {labels.previousStoriesPage}
              </Button>
              <span className={styles.paginationLabel}>
                {labels.storiesPagePosition
                  .replace('{current}', String(page))
                  .replace('{total}', String(pageCount))}
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= pageCount || storiesQuery.isFetching}
              >
                {labels.nextStoriesPage}
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}
