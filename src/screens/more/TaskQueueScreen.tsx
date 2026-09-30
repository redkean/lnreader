import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, View, Text, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import dayjs from 'dayjs';
import {
  FAB,
  ProgressBar,
  Appbar as MaterialAppbar,
  overlay,
} from 'react-native-paper';

import { useTheme } from '@hooks/persisted';

import { showToast } from '../../utils/showToast';
import { getString } from '@i18n/translations';
import {
  Appbar,
  ConfirmationDialog,
  EmptyView,
  IconButtonV2,
  Menu,
  SafeAreaView,
} from '@components';
import { TaskQueueScreenProps } from '@navigators/types';
import {
  BACKGROUND_TASKS_STORE_KEY,
  backgroundTasks,
  FailedBackgroundTask,
  QueuedBackgroundTask,
} from '@services/backgroundTasks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMMKVObject } from 'react-native-mmkv';

const DownloadQueue = ({ navigation }: TaskQueueScreenProps) => {
  const theme = useTheme();
  const { bottom, right } = useSafeAreaInsets();
  const [taskQueue] = useMMKVObject<QueuedBackgroundTask[]>(
    BACKGROUND_TASKS_STORE_KEY,
  );
  const [isRunning, setIsRunning] = useState(backgroundTasks.isRunning);
  const [visible, setVisible] = useState(false);
  const [taskToCancel, setTaskToCancel] = useState<QueuedBackgroundTask>();
  const [failedTasks, setFailedTasks] = useState<FailedBackgroundTask[]>([]);
  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);
  useEffect(() => {
    if (taskQueue?.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRunning(false);
    }
  }, [taskQueue]);

  // A load that was already in flight when a task was dismissed would
  // otherwise put it back.
  const dismissedIds = useRef(new Set<string>());
  const loadFailedTasks = useCallback(() => {
    backgroundTasks
      .getFailedTasks()
      .then(tasks =>
        setFailedTasks(
          tasks.filter(task => !dismissedIds.current.has(task.id)),
        ),
      )
      .catch(() => undefined);
  }, []);

  // A task leaves the queue when it finishes, so that is the moment a new
  // failure can have appeared. Keyed on the ids, not the queue itself, which
  // changes with every progress update.
  const taskIds = (taskQueue ?? []).map(task => task.id).join('|');
  useEffect(loadFailedTasks, [loadFailedTasks, taskIds]);

  // A task that fails natively never touches the queue, and the failure
  // notification opens this screen without remounting it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        loadFailedTasks();
      }
    });
    return () => subscription.remove();
  }, [loadFailedTasks]);

  const dismissFailed = useCallback((task: FailedBackgroundTask) => {
    dismissedIds.current.add(task.id);
    setFailedTasks(current => current.filter(item => item.id !== task.id));
    backgroundTasks.dismissFailedTask(task.id).catch(() => undefined);
  }, []);

  const clearFailed = useCallback(() => {
    setFailedTasks(current => {
      current.forEach(task => dismissedIds.current.add(task.id));
      return [];
    });
    backgroundTasks.clearFailedTasks().catch(() => undefined);
  }, []);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={'Task Queue'}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        <Menu
          visible={visible}
          onDismiss={closeMenu}
          anchor={
            taskQueue?.length || failedTasks.length ? (
              <MaterialAppbar.Action
                icon="dots-vertical"
                iconColor={theme.onSurface}
                onPress={openMenu}
              />
            ) : null
          }
          contentStyle={{ backgroundColor: overlay(2, theme.surface) }}
        >
          {taskQueue?.length ? (
            <Menu.Item
              onPress={() => {
                backgroundTasks.cancelAll();
                setIsRunning(false);
                showToast(getString('downloadScreen.cancelled'));
                closeMenu();
              }}
              title={getString('downloadScreen.cancelDownloads')}
              titleStyle={{ color: theme.onSurface }}
            />
          ) : null}
          {failedTasks.length ? (
            <Menu.Item
              onPress={() => {
                clearFailed();
                closeMenu();
              }}
              title={getString('taskQueue.clearFailedTasks')}
              titleStyle={{ color: theme.onSurface }}
            />
          ) : null}
        </Menu>
      </Appbar>

      <FlatList
        contentContainerStyle={styles.paddingBottom}
        keyExtractor={item => item.id}
        data={taskQueue || []}
        renderItem={({ item }) => (
          <View style={styles.padding}>
            <View style={styles.taskRow}>
              <View style={styles.taskDetails}>
                <Text style={{ color: theme.onSurface }}>{item.meta.name}</Text>
                {item.meta.progressText ? (
                  <Text style={{ color: theme.onSurfaceVariant }}>
                    {item.meta.progressText}
                  </Text>
                ) : null}
                <ProgressBar
                  indeterminate={
                    item.meta.isRunning && item.meta.progress === undefined
                  }
                  progress={item.meta.progress}
                  color={theme.primary}
                  style={[
                    { backgroundColor: theme.surface2 },
                    styles.marginTop,
                  ]}
                />
              </View>
              <IconButtonV2
                accessibilityLabel={`${getString('common.cancel')} ${
                  item.meta.name
                }`}
                name="close"
                onPress={() => setTaskToCancel(item)}
                theme={theme}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          failedTasks.length ? null : (
            <EmptyView
              icon="(･o･;)"
              description={'No running tasks'}
              theme={theme}
            />
          )
        }
        ListFooterComponent={
          failedTasks.length ? (
            <View>
              <Text style={[styles.sectionTitle, { color: theme.error }]}>
                {getString('taskQueue.failedTasks')}
              </Text>
              {failedTasks.map(task => (
                <View key={task.id} style={styles.padding}>
                  <View style={styles.taskRow}>
                    <View style={styles.taskDetails}>
                      <Text style={{ color: theme.onSurface }}>
                        {task.name}
                      </Text>
                      <Text style={{ color: theme.onSurfaceVariant }}>
                        {dayjs(task.failedAt).format('LLL')}
                      </Text>
                    </View>
                    <IconButtonV2
                      accessibilityLabel={`${getString(
                        'taskQueue.copyError',
                      )} ${task.name}`}
                      name="content-copy"
                      onPress={() =>
                        Clipboard.setStringAsync(
                          `${task.name}\n${task.error}`,
                        ).then(() =>
                          showToast(
                            getString('common.copiedToClipboard', { name: '' }),
                          ),
                        )
                      }
                      theme={theme}
                    />
                    <IconButtonV2
                      accessibilityLabel={`${getString(
                        'taskQueue.dismissFailedTask',
                      )} ${task.name}`}
                      name="close"
                      onPress={() => dismissFailed(task)}
                      theme={theme}
                    />
                  </View>
                  <Text
                    selectable
                    style={[styles.marginTop, { color: theme.error }]}
                  >
                    {task.error}
                  </Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />
      {taskQueue && taskQueue.length > 0 ? (
        <FAB
          style={[
            styles.fab,
            { backgroundColor: theme.primary, bottom, right },
          ]}
          color={theme.onPrimary}
          label={
            isRunning ? getString('common.pause') : getString('common.resume')
          }
          uppercase={false}
          icon={isRunning ? 'pause' : 'play'}
          onPress={() => {
            if (isRunning) {
              backgroundTasks.pauseAll();
              setIsRunning(false);
            } else {
              backgroundTasks.resumeAll();
              setIsRunning(true);
            }
          }}
        />
      ) : null}
      <ConfirmationDialog
        title={getString('taskQueue.cancelTaskTitle')}
        message={getString('taskQueue.cancelTaskConfirmation', {
          task: taskToCancel?.meta.name ?? '',
        })}
        visible={taskToCancel !== undefined}
        confirmLabel={getString('taskQueue.cancelTaskAction')}
        cancelLabel={getString('taskQueue.keepTaskAction')}
        onDismiss={() => setTaskToCancel(undefined)}
        onConfirm={() =>
          taskToCancel ? backgroundTasks.cancel(taskToCancel.id) : undefined
        }
      />
    </SafeAreaView>
  );
};

export default DownloadQueue;

const styles = StyleSheet.create({
  fab: {
    bottom: 16,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  marginTop: { marginTop: 8 },
  paddingBottom: { paddingBottom: 100, flexGrow: 1 },
  padding: { padding: 16 },
  sectionTitle: {
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  taskDetails: { flex: 1 },
  taskRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
