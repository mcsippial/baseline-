'use client'

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { BriefContent } from '@/lib/supabase/types'
import { format } from 'date-fns'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#6366f1',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    textAlign: 'right',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: '#6366f1',
    marginBottom: 4,
  },
  providerName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  dateText: {
    fontSize: 9,
    color: '#64748b',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: '#334155',
    marginBottom: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  metricBox: {
    width: '47%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  metricName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#6366f1',
    marginBottom: 2,
  },
  metricTrend: {
    fontSize: 8.5,
    color: '#f59e0b',
    marginBottom: 2,
  },
  metricNote: {
    fontSize: 8,
    color: '#64748b',
    lineHeight: 1.4,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  col: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bullet: {
    fontSize: 9,
    color: '#6366f1',
    marginRight: 4,
    marginTop: 1,
  },
  listText: {
    fontSize: 9,
    color: '#334155',
    lineHeight: 1.5,
    flex: 1,
  },
  questionBox: {
    backgroundColor: '#eef2ff',
    borderRadius: 4,
    padding: 10,
    marginBottom: 4,
  },
  questionItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  questionNumber: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#6366f1',
    marginRight: 6,
    minWidth: 14,
  },
  questionText: {
    fontSize: 9,
    color: '#334155',
    lineHeight: 1.5,
    flex: 1,
  },
  disclaimer: {
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  disclaimerText: {
    fontSize: 7.5,
    color: '#94a3b8',
    lineHeight: 1.4,
    fontStyle: 'italic',
  },
})

interface BriefPDFProps {
  content: BriefContent
  providerName: string
  appointmentDate: string
  patientName?: string
}

export function BriefPDF({
  content,
  providerName,
  appointmentDate,
  patientName,
}: BriefPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.subtitle}>Baseline Health Intelligence</Text>
            <Text style={styles.title}>Clinical Context Brief</Text>
            {patientName && (
              <Text style={styles.paragraph}>Prepared for: {patientName}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.providerName}>{providerName}</Text>
            <Text style={styles.dateText}>
              {format(new Date(appointmentDate), 'MMMM d, yyyy')}
            </Text>
            <Text style={styles.dateText}>
              Generated {format(new Date(), 'PPp')}
            </Text>
          </View>
        </View>

        {/* Executive Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.paragraph}>{content.summary}</Text>
        </View>

        {/* Key Metrics */}
        {content.keyMetrics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <View style={styles.metricsGrid}>
              {content.keyMetrics.map((metric, i) => (
                <View key={i} style={styles.metricBox}>
                  <Text style={styles.metricName}>{metric.name}</Text>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                  <Text style={styles.metricTrend}>{metric.trend}</Text>
                  <Text style={styles.metricNote}>{metric.note}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Concerns and Positives */}
        <View style={styles.twoCol}>
          {content.concerns.length > 0 && (
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>Areas to Discuss</Text>
              {content.concerns.map((concern, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>›</Text>
                  <Text style={styles.listText}>{concern}</Text>
                </View>
              ))}
            </View>
          )}
          {content.positives.length > 0 && (
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>Positive Indicators</Text>
              {content.positives.map((pos, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={[styles.bullet, { color: '#10b981' }]}>✓</Text>
                  <Text style={styles.listText}>{pos}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Questions for Provider */}
        {content.questionsForProvider.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Questions for Your Provider</Text>
            <View style={styles.questionBox}>
              {content.questionsForProvider.map((q, i) => (
                <View key={i} style={styles.questionItem}>
                  <Text style={styles.questionNumber}>{i + 1}.</Text>
                  <Text style={styles.questionText}>{q}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Data Note: {content.rawDataSummary}
          </Text>
          <Text style={styles.disclaimerText}>
            This brief was generated by Baseline AI and should be reviewed in conjunction with clinical judgment.
            It is not a substitute for professional medical advice.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
