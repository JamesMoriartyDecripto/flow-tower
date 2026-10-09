import AppIntents
import SwiftUI
import WidgetKit

// Reads plants due today from the App Group written by the app. No network in the widget.
struct DuePlant: Codable, Identifiable { let id: String; let name: String }

private let store = UserDefaults(suiteName: "group.com.example.leafwise")
private let key = "leafwise.widget.dueToday"

func loadDue() -> [DuePlant] {
  guard let data = store?.data(forKey: key) else { return [] }
  return (try? JSONDecoder().decode([DuePlant].self, from: data)) ?? []
}

struct MarkWatered: AppIntent {
  static var title: LocalizedStringResource = "Mark as watered"
  @Parameter(title: "Plant") var plantId: String
  init() {}
  init(plantId: String) { self.plantId = plantId }

  func perform() async throws -> some IntentResult {
    // Queue the event; the app syncs it to Supabase on next foreground or background task.
    var queue = store?.stringArray(forKey: "leafwise.widget.pending") ?? []
    queue.append(plantId)
    store?.set(queue, forKey: "leafwise.widget.pending")
    let remaining = loadDue().filter { $0.id != plantId }
    store?.set(try? JSONEncoder().encode(remaining), forKey: key)
    return .result()
  }
}

struct Entry: TimelineEntry { let date: Date; let plants: [DuePlant] }

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: .now, plants: [DuePlant(id: "1", name: "Monstera")]) }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now, plants: loadDue())) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let next = Calendar.current.date(byAdding: .hour, value: 3, to: .now)!
    completion(Timeline(entries: [Entry(date: .now, plants: loadDue())], policy: .after(next)))
  }
}

struct WaterWidgetView: View {
  let entry: Entry
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(entry.plants.isEmpty ? "All watered" : "Due today").font(.headline)
      ForEach(entry.plants.prefix(3)) { plant in
        HStack {
          Link(plant.name, destination: URL(string: "leafwise://plant/\(plant.id)")!)
          Spacer()
          Button(intent: MarkWatered(plantId: plant.id)) { Image(systemName: "drop.fill") }
            .accessibilityLabel("Mark \(plant.name) as watered")
        }
      }
    }
    .containerBackground(Color("$widgetBackground"), for: .widget)
  }
}

@main
struct WaterWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WaterWidget", provider: Provider()) { WaterWidgetView(entry: $0) }
      .configurationDisplayName("Due today")
      .description("Plants to water today.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
