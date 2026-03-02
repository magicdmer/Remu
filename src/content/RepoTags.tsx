import * as React from 'react';
import * as echarts from 'echarts';
import {
  ITag,
  STORAGE_TAGS,
  STORAGE_REPO,
  IRepoWithTag,
  TagId,
  RepoId,
  ITagsAction,
  IRepoWithNote,
  STORAGE_NOTES,
  Token,
} from '../typings';
import SelectTags, { ISelectTagsProps } from './SelectTags';
import { useEffect, useRef, useState } from 'react';
import { localStoragePromise } from '../utils';
import { Popover, Input, Button, message, Icon } from 'antd';
import getStarHistory from './getStarHistory';

const TextArea = Input.TextArea;

export interface IRepoTagsProps {
  repoId: RepoId;
  token: Token;
  repoNwo: string;
  tags: ITag[];
  caseSensitivity: boolean;
  repoWithTags: IRepoWithTag;
  repoWithNotes: IRepoWithNote;
}
const RepoTags = (props: IRepoTagsProps) => {
  const { repoWithTags, repoWithNotes, repoId, repoNwo, token } = props;
  const [starred, setStarred] = useState(false);
  const [focusSelect, setFocusSelect] = useState(false);
  const starredRef = useRef(false);
  const [notesValue, setNotesValue] = useState<string>(
    repoWithNotes[repoId] || '',
  );
  const [starHistory, setStarHistory] = useState(null);

  const getStarredStatus = () => {
    // Legacy support
    const legacyStarContainer = document.querySelector('.starring-container');
    if (legacyStarContainer) {
      return legacyStarContainer.className.includes(' on');
    }

    // Modern GitHub support
    // Check for "Unstar" button existence which implies the repo is starred
    const unstarBtn = document.querySelector(
      'button[data-testid="unstar-button"], button.starred, button[aria-label^="Unstar"], form[action*="/unstar"] button'
    );
    if (unstarBtn) return true;

    // Check for button with aria-pressed="true" inside social form or any star button container
    const pressedBtn = document.querySelector(
      'form.js-social-form button[aria-pressed="true"], .starring-container button[aria-pressed="true"], button[aria-pressed="true"].js-toggler-target'
    );
    if (pressedBtn) return true;

    // Check for container with "starred" class
    const starredContainer = document.querySelector('.starred > button, .starred > form button');
    if (starredContainer) return true;

    return false;
  };

  const isStarButtonClick = (target: EventTarget) => {
    const el = target as Element;
    if (!el || !el.closest) {
      return false;
    }

    return !!el.closest(
      '.starring-container, form.js-social-form, [data-testid="star-button"], [data-testid="unstar-button"], button[aria-label*="star"], form[action*="/star"] button, .js-toggler-target'
    );
  };

  const selectTagsProps: ISelectTagsProps = { ...props };

  useEffect(() => {
    const initialStarred = getStarredStatus();
    starredRef.current = initialStarred;
    setStarred(initialStarred);

    const syncStarredStatus = () => {
      let attempts = 0;
      const check = () => {
        const currentStarred = getStarredStatus();
        if (currentStarred !== starredRef.current) {
          starredRef.current = currentStarred;
          handleStaringClick(currentStarred);
          return;
        }

        attempts += 1;
        if (attempts < 8) {
          setTimeout(check, 250);
        }
      };

      setTimeout(check, 0);
    };

    const handleDocumentClick = (e: MouseEvent) => {
      if (!isStarButtonClick(e.target)) {
        return;
      }

      syncStarredStatus();
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, []);

  useEffect(() => {
    if (!starHistory) {
      return;
    }

    const xData = [];
    const yData = [];
    starHistory.forEach((item) => {
      xData.push(item.date);
      yData.push(item.starNum);
    });
    const option = {
      title: {
        text: 'Star History',
      },
      tooltip: {},
      legend: {
        data: [repoNwo],
      },
      xAxis: {
        data: xData,
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: repoNwo,
          data: yData,
          type: 'line',
        },
      ],
    };

    setTimeout(() => {
      const el = document.getElementById('-remu-main');
      const myChart = echarts.init(el);
      myChart.setOption(option);
    });
  }, [starHistory]);

  const handleStaringClick = (isStarred: boolean) => {
    if (!isStarred) {
      if (repoWithTags[repoId]) {
        delete repoWithTags[repoId];
        const newRepoWithTags = { ...repoWithTags };
        localStoragePromise
          .set({
            [STORAGE_REPO]: newRepoWithTags,
          })
          .catch((e) => {
            // todo
            // tslint:disable-next-line:no-console
            console.error('errors: ', e);
          });
      }

      setStarred(false);
      return;
    }

    setFocusSelect(true);
    setStarred(true);
  };
  const handleNotesPressEnter = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.ctrlKey) {
      const value = (e.target as HTMLTextAreaElement).value;
      const _repoWithNotes = { ...repoWithNotes, [repoId]: value };
      localStoragePromise.set({ [STORAGE_NOTES]: _repoWithNotes }).then(() => {
        message.success('Add notes successfully!');
      });
    }
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotesValue(value);
  };

  const handleClickStarHistoryBtn = async () => {
    if (starHistory) {
      return;
    }

    try {
      const starHistory = await getStarHistory(repoNwo, token);
      setStarHistory(starHistory);
    } catch (e) {
      message.error(e.message);
      // tslint:disable-next-line:no-console
      console.log(e);
    }
  };

  return (
    <div className="-remu-content">
      {/*
                    // @ts-ignore */}
      <Popover
        placement="bottomLeft"
        trigger={'click'}
        onClick={handleClickStarHistoryBtn}
        content={
          <div>
            {starHistory ? (
              <div
                id="-remu-main"
                style={{ width: '600px', height: '400px' }}
              ></div>
            ) : (
              <span>
                <h4>Star History </h4>
                {/*
                    // @ts-ignore */}
                loading <dot>...</dot>
              </span>
            )}
          </div>
        }
      >
        <Button
          style={{
            color: '#1b1f23',
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Icon
            type="history"
            style={{ color: '#959da5', fontSize: '16px', marginTop: '-1px' }}
          />
          Star History
        </Button>
      </Popover>
      &nbsp;
      {starred && (
        <>
          <Popover
            placement="bottomLeft"
            trigger={'click'}
            content={
              <div>
                <h4>Notes</h4>
                <TextArea
                  style={{ marginTop: '10px', marginBottom: '15px' }}
                  rows={6}
                  cols={32}
                  value={notesValue}
                  onChange={handleNotesChange}
                  onPressEnter={handleNotesPressEnter}
                />
                <div className="-remu-notes-hotkey-hint">
                  Confirm by <b>Ctrl + Enter</b>
                </div>
              </div>
            }
          >
            <Button
              style={{
                color: '#1b1f23',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Icon
                type="book"
                style={{
                  color: '#959da5',
                  fontSize: '15px',
                  marginTop: '-1px',
                }}
              />
              Notes
            </Button>
          </Popover>
          &nbsp;
          <SelectTags isFocus={focusSelect} {...selectTagsProps} />
        </>
      )}
    </div>
  );
};

export default RepoTags;
