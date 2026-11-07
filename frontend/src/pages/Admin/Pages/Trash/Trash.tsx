import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';
import { useTrashAccess } from './hooks/useTrashAccess';
import PostsTrashPanel from './components/PostsTrashPanel';
import BloggerTrashPanel from './components/BloggerTrashPanel';
import styles from './Trash.module.css';

export default function TrashPage() {
  const { language } = useCmsConfig();
  const labels = adminTranslations[language];
  const { activeTab, canViewPosts, canViewBlogger, setActiveTab } =
    useTrashAccess();

  return (
    <main className={`cms-theme ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{labels.trash}</h1>
      </header>

      <nav className={styles.tabs} aria-label={labels.trash}>
        {canViewPosts ? (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'posts' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            {labels.postsTitle}
          </button>
        ) : null}
        {canViewBlogger ? (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'blogger' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('blogger')}
          >
            {labels.bloggerTitle}
          </button>
        ) : null}
      </nav>

      <div className={styles.panel}>
        {activeTab === 'posts' ? (
          <PostsTrashPanel labels={labels} language={language} />
        ) : activeTab === 'blogger' ? (
          <BloggerTrashPanel labels={labels} language={language} />
        ) : null}
      </div>
    </main>
  );
}
