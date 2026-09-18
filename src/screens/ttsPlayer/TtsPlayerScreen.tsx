import { TtsPlayerScreenProps } from '@navigators/types';

import TtsPlayerView from './components/TtsPlayerView';

const TtsPlayerScreen = ({ navigation }: TtsPlayerScreenProps) => (
  <TtsPlayerView onClose={navigation.goBack} />
);

export default TtsPlayerScreen;
