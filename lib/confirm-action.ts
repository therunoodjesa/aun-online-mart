import { Alert, Platform } from 'react-native';

type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
};

export function confirmAction({ title, message, confirmLabel, onConfirm, destructive = false }: ConfirmAction) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) void onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => void onConfirm() },
  ]);
}
