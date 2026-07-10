import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Divider, List, Surface, Text } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { groupsApi, GroupMember } from '@/api/groups';
import { useAuth } from '@/context/AuthContext';

function MemberRow({ member, isAdmin }: { member: GroupMember; isAdmin: boolean }) {
  return (
    <List.Item
      title={member.alias}
      description={member.email}
      left={() => (
        <Avatar.Text size={36} label={member.alias.slice(0, 2).toUpperCase()} />
      )}
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

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: group, isLoading, isError } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id),
    enabled: !!id,
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
      </View>
    );
  }

  const isGroupAdmin = user?.id === group.admin._id;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={styles.groupName}>{group.name}</Text>
      <Text variant="bodyMedium" style={styles.season}>Temporada {group.season}</Text>

      <Surface style={styles.codeBox} elevation={1}>
        <View style={styles.codeRow}>
          <View>
            <Text variant="labelSmall" style={styles.codeLabel}>Código de invitación</Text>
            <Text variant="titleMedium" style={styles.codeValue}>{group.inviteCode}</Text>
          </View>
          <Button
            mode="outlined"
            compact
            icon={copied ? 'check' : 'content-copy'}
            onPress={copyCode}
          >
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

      <Divider style={styles.divider} />

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Miembros ({group.members.length})
      </Text>

      {group.members.map((member) => (
        <MemberRow
          key={member._id}
          member={member}
          isAdmin={member._id === group.admin._id}
        />
      ))}

      {isGroupAdmin && (
        <>
          <Divider style={styles.divider} />
          <Text variant="labelMedium" style={styles.adminNote}>
            Eres el admin de esta peña. La configuración de reglas llega en una fase posterior.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  groupName: {
    marginBottom: 2,
  },
  season: {
    opacity: 0.6,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 4,
  },
  actionButton: {
    flex: 1,
  },
  codeBox: {
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeLabel: {
    opacity: 0.6,
    marginBottom: 2,
  },
  codeValue: {
    letterSpacing: 2,
  },
  divider: {
    marginVertical: 12,
  },
  sectionTitle: {
    marginBottom: 4,
    opacity: 0.7,
  },
  adminChip: {
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'center',
  },
  adminChipText: {
    color: '#1565C0',
  },
  adminNote: {
    opacity: 0.5,
    textAlign: 'center',
    padding: 8,
  },
  errorText: {
    color: '#9C3B2C',
  },
});
