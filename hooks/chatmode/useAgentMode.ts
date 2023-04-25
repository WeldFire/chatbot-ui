import { MutableRefObject, useContext } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';

import useApiService from '@/services/useApiService';
import useStorageService from '@/services/useStorageService';

import { watchRefToAbort } from '@/utils/app/api';
import { HomeUpdater } from '@/utils/app/homeUpdater';

import { Answer, PlanningResponse, PluginResult } from '@/types/agent';
import {
  ChatModeRunner,
  ChatModeRunnerParams,
  Conversation,
} from '@/types/chat';

import HomeContext from '@/pages/api/home/home.context';

import useConversations from '../useConversations';

export function useAgentMode(
  conversations: Conversation[],
  stopConversationRef: MutableRefObject<boolean>,
): ChatModeRunner {
  const { t } = useTranslation('chat');
  const { t: errT } = useTranslation('error');

  const { dispatch: homeDispatch } = useContext(HomeContext);
  const apiService = useApiService();
  const storageService = useStorageService();
  const [_, conversationsAction] = useConversations();

  const updater = new HomeUpdater(homeDispatch);
  const mutation = useMutation({
    mutationFn: async (params: ChatModeRunnerParams): Promise<Answer> => {
      let planningCount = 0;
      let toolActionResults: PluginResult[] = [];
      let taskId: string | undefined = undefined;
      while (true) {
        if (planningCount > 5) {
          // todo: handle this
          return { type: 'answer', answer: t('No Result') };
        }
        const planningResponse: PlanningResponse = await watchRefToAbort(
          stopConversationRef,
          (controller) =>
            apiService.planning(
              {
                taskId,
                key: params.body.key,
                model: params.body.model,
                messages: params.body.messages,
                pluginResults: toolActionResults,
                enabledToolNames: params.plugins.map((p) => p.nameForModel),
              },
              controller.signal,
            ),
        );
        taskId = planningResponse.taskId;
        const { result } = planningResponse;
        if (result.type === 'action') {
          planningCount++;
          const tool = result.plugin;
          if (tool.displayForUser) {
            const simpleQuery =
              result.pluginInput.length < 100 &&
              result.pluginInput.match(/^[\[\{}]]/) === null;
            let content = `${tool.nameForHuman} ${t('executing...')}`;
            if (simpleQuery) {
              content = `${tool.nameForHuman} ${t('executing...')} - ${
                result.pluginInput
              }`;
            }
            params.conversation = updater.addMessage(params.conversation, {
              role: 'assistant',
              content,
            });
          }
          const actinoResult = await apiService.runPlugin({
            taskId,
            model: params.body.model,
            input: result.pluginInput,
            action: result,
          });
          toolActionResults.push(actinoResult);
        } else {
          return { type: 'answer', answer: result.answer };
        }
        if (stopConversationRef.current === true) {
          stopConversationRef.current = false;
          return { type: 'answer', answer: t('Conversation stopped') };
        }
      }
    },
    onMutate: async (variables) => {
      homeDispatch({
        field: 'selectedConversation',
        value: variables.conversation,
      });
      homeDispatch({ field: 'loading', value: true });
      homeDispatch({ field: 'messageIsStreaming', value: true });
    },
    async onSuccess(answer: Answer, variables, context) {
      let { conversation: updatedConversation, selectedConversation } =
        variables;

      updatedConversation = updater.addMessage(updatedConversation, {
        role: 'assistant',
        content: answer.answer,
      });
      await storageService.saveSelectedConversation(updatedConversation);
      const updatedConversations: Conversation[] = conversations.map(
        (conversation) => {
          if (conversation.id === selectedConversation.id) {
            return updatedConversation;
          }
          return conversation;
        },
      );
      if (updatedConversations.length === 0) {
        updatedConversations.push(updatedConversation);
      }
      await conversationsAction.updateAll(updatedConversations);

      homeDispatch({ field: 'loading', value: false });
      homeDispatch({ field: 'messageIsStreaming', value: false });
    },
    onError: async (error) => {
      homeDispatch({ field: 'loading', value: false });
      homeDispatch({ field: 'messageIsStreaming', value: false });
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.error(t('Conversation stopped'));
      } else if (error instanceof Response) {
        const json = await error.json();
        toast.error(errT(json.error || json.message || 'error'));
      } else {
        toast.error(error?.toString() || 'error');
      }
    },
  });

  return {
    run: (params: ChatModeRunnerParams) => {
      mutation.mutate(params);
    },
  };
}
