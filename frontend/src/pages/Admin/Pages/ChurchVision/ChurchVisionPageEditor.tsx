import { useEffect, useRef } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../shared/components/ui/Select/Select';
import { useChurchVisionPageEditor } from './useChurchVisionPageEditor';
import styles from './ChurchVisionPageEditor.module.css';

export default function ChurchVisionPageEditor() {
  const editor = useChurchVisionPageEditor();
  const { labels, current } = editor;
  const disabled = !editor.isReady || editor.isSaving;
  const pendingFocusGoalId = useRef<string | null>(null);
  const goalInputRefs = useRef(
    new Map<string, HTMLInputElement | HTMLTextAreaElement>(),
  );

  useEffect(() => {
    const goalId = pendingFocusGoalId.current;
    if (!goalId) {
      return;
    }
    const input = goalInputRefs.current.get(goalId);
    if (!input) {
      return;
    }
    pendingFocusGoalId.current = null;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  }, [current.goals]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </header>

      {editor.loadFailed ? (
        <div className={styles.loadError} role="alert">
          <p>{labels.loadFailed}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void editor.reload()}
          >
            {labels.retry}
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.language}>
            <Select
              label={labels.language}
              options={editor.editLanguageOptions}
              value={editor.editLanguage}
              onChange={editor.setLanguage}
            />
          </div>

          <div className={styles.fields} aria-busy={!editor.isReady}>
            <section className={styles.group}>
              <InputField
                label={labels.heading}
                value={current.heading}
                disabled={disabled}
                multiline
                rows={2}
                onChange={editor.updateHeading}
              />
            </section>

            <section className={styles.group} aria-labelledby="church-vision-goals">
              <div className={styles.listHeading}>
                <h2 id="church-vision-goals">{labels.goals}</h2>
                <button
                  type="button"
                  className={styles.addButton}
                  aria-label={labels.addGoal}
                  title={labels.addGoal}
                  disabled={disabled}
                  onClick={() => {
                    pendingFocusGoalId.current = editor.addGoal();
                  }}
                >
                  <FiPlus aria-hidden />
                </button>
              </div>
              <div className={styles.goalList}>
                {current.goals.map((goal, index) => (
                  <fieldset className={styles.goal} key={goal.id}>
                    <legend>
                      {labels.goal} {index + 1}
                      <button
                        type="button"
                        className={styles.removeButton}
                        aria-label={`${index + 1}. ${labels.removeGoal}`}
                        title={labels.removeGoal}
                        disabled={disabled}
                        onClick={() => editor.removeGoal(goal.id)}
                      >
                        <FiTrash2 aria-hidden />
                      </button>
                    </legend>
                    <InputField
                      label={labels.goalTitle}
                      value={goal.title}
                      disabled={disabled}
                      multiline
                      rows={2}
                      ref={(element) => {
                        if (element) {
                          goalInputRefs.current.set(goal.id, element);
                        } else {
                          goalInputRefs.current.delete(goal.id);
                        }
                      }}
                      onChange={(value) =>
                        editor.updateGoal(goal.id, 'title', value)
                      }
                    />
                    <InputField
                      label={labels.quotation}
                      value={goal.quotation}
                      disabled={disabled}
                      multiline
                      rows={3}
                      onChange={(value) =>
                        editor.updateGoal(goal.id, 'quotation', value)
                      }
                    />
                    <InputField
                      label={labels.reference}
                      value={goal.reference}
                      disabled={disabled}
                      onChange={(value) =>
                        editor.updateGoal(goal.id, 'reference', value)
                      }
                    />
                  </fieldset>
                ))}
              </div>
              {!editor.isContentComplete && current.goals.length ? (
                <p className={styles.completionHint} role="status">
                  {labels.contentIncomplete}
                </p>
              ) : null}
            </section>
          </div>

          <div className={styles.actions}>
            <Button
              type="button"
              onClick={() => void editor.save()}
              disabled={
                disabled ||
                editor.loadFailed ||
                !editor.isDirty ||
                !editor.isContentComplete
              }
            >
              {editor.isSaving ? `${labels.save}...` : labels.save}
            </Button>
          </div>
        </>
      )}

      <Dialog
        isOpen={editor.hasConflict}
        title={labels.conflictTitle}
        onClose={editor.dismissConflict}
        closeLabel={labels.close}
        footer={
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={editor.dismissConflict}
            >
              {labels.keepEditing}
            </Button>
            <Button type="button" onClick={() => void editor.reloadLatest()}>
              {labels.reloadLatest}
            </Button>
          </div>
        }
      >
        <p>{labels.conflictMessage}</p>
      </Dialog>
    </div>
  );
}
