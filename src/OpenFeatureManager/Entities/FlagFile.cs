using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("flag_files")]
public class FlagFile
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<FileMetadataEntry> Metadata { get; set; } = [];
    public List<FlagEntry> Flags { get; set; } = [];
    public List<EnvironmentEntry> Environments { get; set; } = [];
    public List<TimeWindow> TimeWindows { get; set; } = [];
}
