import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Divider, List, Surface, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { groupsApi, GroupMember } from '@/api/groups';
import { useAuth } from '@/context/AuthContext';

function MemberRow({ member, isAdmin }: { member: GroupMember; isAdmin: boolean }) {
  return (
    <List.Item
      title={member.alias}
      description={member.email}
      left={() => <Avatar.Text size={36} label={member.alias.slice(0, 2).toUpperCase()} />}
      right={() =>
        isAdmin ? (
          <View style={styles.adminChip}>
            <Text variant="labelSmall" style={styles.adminChipText}>Admin</Text>
          </View>
        ) : null
      }
    />
  );
}

interface Props {
  groupId: string;
  onLeave: () => void;
}

export function GroupDetail({ groupId, onLeave }: Props) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: group, isLoading, isError } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });

  async function copyCode() {
    if (!group) return;
    await Clipboard.setStringAsync(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || !group) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No se pudo cargar la peña</Text>
        <Button onPress={onLeave} style={{ marginTop: 12 }}>Volver a peñas</Button>
      </View>
    );
  }

  const isGroupAdmin = user?.id === group.admin._id;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={styles.groupName}>{group.name}</Text>
      <Text variant="bodyMedium" style={styles.season}>Temporada {group.season}</Text>

      <Surface style={styles.codeBox} elevation={1}>
        <View style={styles.codeRow}>
          <View>
            <Text variant="labelSmall" style={styles.codeLabel}>Código de invitación</Text>
            <Text variant="titleMedium" style={styles.codeValue}>{group.inviteCode}</Text>
          </View>
          <Button mode="outlined" compact icon={copied ? 'check' : 'content-copy'} onPress={copyCode}>
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </View>
      </Surface>

      <View style={styles.actionButtons}>
        <Button
          mode="contained"
          icon="soccer"
          style={styles.actionButton}
          onPress={() => router.push({ pathname: '/predictions/[season]', params: { season: group.season } })}
        >
          Predicciones
        </Button>
        <Button
          mode="contained-tonal"
          icon="trophy"
          style={styles.actionButton}
          onPress={() => router.push({ pathname: '/ranking/[groupId]', params: { groupId: group._id, season: group.season } })}
        >
          Ranking
        </Button>
      </View>
      <Button
        mode="outlined"
        icon="trophy-outline"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => router.push({ pathname: '/knockout/[season]' as any, params: { season: group.season } })}
      >
        Copa / Supercopa
      </Button>

      <View style={styles.secondaryButtons}>
        <Button
          mode="outlined"
          icon="table"
          style={styles.halfButton}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push({ pathname: '/standings-prediction/[season]' as any, params: { season: group.season } })}
        >
          Clasificación
        </Button>
        <Button
          mode="outlined"
          icon="medal"
          style={styles.halfButton}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push({ pathname: '/award-prediction/[season]' as any, params: { season: group.season } })}
        >
          Premios
        </Button>
      </View>

      <Divider style={styles.divider} />

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Miembros ({group.members.length})
      </Text>

      {group.members.map((member) => (
        <MemberRow key={member._id} member={member} isAdmin={member._id === group.admin._id} />
      ))}

      {isGroupAdmin && (
        <>
          <Divider style={styles.divider} />
          <Button
            mode="contained-tonal"
            icon="cog"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push({ pathname: '/admin/[groupId]' as any, params: { groupId: group._id, season: group.season } })}
          >
            Panel de admin
          </Button>
        </>
      )}

      <Divider style={styles.divider} />

      <Button mode="text" icon="swap-horizontal" onPress={onLeave}>
        Cambiar de peña
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, gap: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  groupName: { marginBottom: 2 },
  season: { opacity: 0.6, marginBottom: 16 },
  actionButtons: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  actionButton: { flex: 1 },
  secondaryButtons: { flexDirection: 'row', gap: 10 },
  halfButton: { flex: 1 },
  codeBox: { borderRadius: 8, padding: 16, marginVertical: 8 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeLabel: { opacity: 0.6, marginBottom: 2 },
  codeValue: { letterSpacing: 2 },
  divider: { marginVertical: 12 },
  sectionTitle: { marginBottom: 4, opacity: 0.7 },
  adminChip: { backgroundColor: '#E8F4FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'center' },
  adminChipText: { color: '#1565C0' },
  adminNote: { opacity: 0.5, textAlign: 'center', padding: 8 },
  errorText: { color: '#9C3B2C' },
});
